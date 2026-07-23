import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';

// CRITICAL: Forzar zona horaria Ecuador ANTES de importar osodreamer.
// La librería osodreamer usa getTimezoneOffset() para calcular el SigningTime XAdES.
// En Vercel (UTC, offset=0), la fórmula interna tiene un bug que SUMA 5h en vez de
// restar, generando una fecha futura que el SRI rechaza con "FIRMA INVÁLIDA (ID 39)".
// Al forzar TZ=America/Guayaquil, getTimezoneOffset() devuelve 300 y la fórmula funciona.
process.env.TZ = 'America/Guayaquil';

const { generateXmlInvoice, signXml, validateXml, authorizeXml } = require('osodreamer-sri-xml-signer');
import fs from 'fs';
import path from 'path';
import { TAX_CONFIG, calculateTotals } from '../../../src/utils/taxes';
import { sanitizeFirestorePayload } from '../../../src/utils/sanitize';

const round2 = (val) => Number(Number(val).toFixed(2));
const pad2 = (n) => String(n).padStart(2, '0');
const formatSriDate = (d = new Date()) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    
    // 1. Validar JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Falta token.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    // (Falta validación detallada de permisos aquí, pero asumo que puede facturar)

    // 2. Extraer datos del request
    const { cliente, productos, emisorId, formaPago } = req.body;
    
    if (!emisorId || !cliente || !productos || productos.length === 0) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para emitir la factura.' });
    }
    
    const transactionId = req.body.transactionId;
    if (!transactionId) {
       return res.status(400).json({ error: 'Falta transactionId de idempotencia.' });
    }

    // 1. Verificación de Idempotencia (Prevenir Doble Facturación)
    const idempotencyRef = adminDb.collection('idempotency_keys').doc(transactionId);
    const idoc = await idempotencyRef.get();
    
    if (idoc.exists) {
      console.log(`⚠️ [Idempotencia] Petición duplicada bloqueada: ${transactionId}`);
      // Ya se procesó o está en proceso. Retornar el resultado almacenado en sri_logs si existe,
      // o un error indicando que está en proceso.
      const logQuery = await adminDb.collection('sri_logs').where('transactionId', '==', transactionId).limit(1).get();
      if (!logQuery.empty) {
        const logData = logQuery.docs[0].data();
        return res.status(200).json({
          success: logData.estadoSri === 'AUTORIZADO',
          claveAcceso: logData.claveAcceso || logQuery.docs[0].id,
          estado: logData.estadoSri,
          numeroComprobante: logData.numeroComprobante,
          idempotent: true
        });
      } else {
        return res.status(429).json({ error: 'La transacción está actualmente en proceso.' });
      }
    }

    // Bloquear de inmediato el transactionId para que peticiones paralelas choquen aquí
    await idempotencyRef.set({ createdAt: new Date(), status: 'PROCESSING' });

    // 2. Extraer Emisor desde Firestore
    const emisorDoc = await adminDb.collection('issuers').doc(emisorId).get();
    if (!emisorDoc.exists) {
      return res.status(404).json({ error: 'Emisor no encontrado en la base de datos' });
    }
    const emisor = emisorDoc.data();

    const isNotaVenta = req.body.isNotaVenta === true;

    // 4. Leer firma electrónica de la bóveda secreta (Multi-Emisor Cloud)
    let p12Buffer = null;
    let p12Password = null;

    if (!isNotaVenta) {
      const secretDoc = await adminDb.collection('issuers_secrets').doc(emisorId).get();
      if (!secretDoc.exists) {
        return res.status(500).json({ error: 'Falta la configuración de seguridad para este emisor. Sube la firma .p12 en la Configuración para emitir Facturas SRI.' });
      }
      const secretData = secretDoc.data();
      p12Buffer = Buffer.from(secretData.p12Base64, 'base64');
      p12Password = secretData.password;

      if (!p12Buffer || !p12Password) {
        return res.status(500).json({ error: 'La firma electrónica o contraseña en la bóveda están corruptas.' });
      }
    }

    // 5. Cálculos tributarios centralizados (función única calculateTotals)
    const vatIncluded = req.body.vatIncluded !== false;
    const totalsCalc = calculateTotals(productos, vatIncluded, isNotaVenta);

    const subtotalSinImpuestos = totalsCalc.subtotal;
    const valorIva = totalsCalc.ivaAmount;
    const importeTotal = totalsCalc.total;

    const detalles = totalsCalc.detalles.map(d => ({
      codigoPrincipal: d.id,
      descripcion: d.nombre,
      cantidad: d.qty,
      precioUnitario: d.precioUnitario,
      descuento: d.descuento,
      precioTotalSinImpuesto: d.precioTotalSinImpuesto,
      impuestos: {
        impuesto: [
          {
            codigo: 2, // IVA
            codigoPorcentaje: TAX_CONFIG.IVA.CODE,
            tarifa: TAX_CONFIG.IVA.RATE,
            baseImponible: d.precioTotalSinImpuesto,
            valor: d.iva
          }
        ]
      }
    }));

    const estab = emisor.establecimiento || '001';
    const ptoEmi = emisor.puntoEmision || '001';
    const secKey = `${estab}_${ptoEmi}`;

    // 6. Generar Secuencial de forma ATÓMICA (Evita race conditions)
    // Se ejecuta solo después de que TODAS las validaciones pasaron
    let nextSecuencial = 0;
    const secKeyNV = `${estab}_${ptoEmi}_NV`;
    
    if (!isNotaVenta) {
      nextSecuencial = await adminDb.runTransaction(async (t) => {
        const ref = adminDb.collection('issuers').doc(emisorId);
        const doc = await t.get(ref);
        const data = doc.data();
        
        // Manejar la estructura anidada de secuenciales
        const secuenciales = data.secuenciales || {};
        const current = secuenciales[secKey] || 0;
        const next = current + 1;
        
        // Actualizar específicamente el contador para esta combinación estab_pto sin borrar los demás
        t.update(ref, { [`secuenciales.${secKey}`]: next });
        return next;
      });
    } else {
      // Secuencial atómico para Nota de Venta
      nextSecuencial = await adminDb.runTransaction(async (t) => {
        const ref = adminDb.collection('issuers').doc(emisorId);
        const doc = await t.get(ref);
        const data = doc.data();
        
        const secuenciales = data.secuenciales || {};
        const current = secuenciales[secKeyNV] || 0;
        const next = current + 1;
        
        t.update(ref, { [`secuenciales.${secKeyNV}`]: next });
        return next;
      });
    }

    const secStr = String(nextSecuencial).padStart(9, '0');
    const numeroComprobanteCompleto = isNotaVenta ? `NV-${estab}-${ptoEmi}-${secStr}` : `${estab}-${ptoEmi}-${secStr}`;

    const invoiceData = {
      infoTributaria: {
        ambiente: process.env.SRI_ENVIRONMENT === 'production' ? 2 : 1,
        tipoEmision: 1,
        razonSocial: isNotaVenta ? 'GRAVITY DENIM' : (emisor.razonSocial || emisor.name || 'Sin Razón Social'),
        nombreComercial: isNotaVenta ? 'GRAVITY DENIM' : (emisor.nombreComercial || emisor.razonSocial || emisor.name || 'Sin Nombre Comercial'),
        ruc: emisor.ruc,
        claveAcceso: 'GENERADA_AUTOMATICAMENTE_POR_OSODREAMER',
        codDoc: '01',
        estab: estab,
        ptoEmi: ptoEmi,
        secuencial: secStr,
        dirMatriz: emisor.direccionMatriz
      },
      infoFactura: {
        fechaEmision: new Date().toISOString(),
        dirEstablecimiento: emisor.direccionEstablecimiento || emisor.direccionMatriz,
        obligadoContabilidad: emisor.obligadoContabilidad ? 'SI' : 'NO',
        tipoIdentificacionComprador: cliente.tipoDocumento === 'CEDULA' ? '05' : cliente.tipoDocumento === 'RUC' ? '04' : cliente.tipoDocumento === 'CONSUMIDOR_FINAL' ? '07' : '06',
        razonSocialComprador: cliente.nombre,
        identificacionComprador: cliente.numeroIdentificacion,
        direccionComprador: cliente.direccion || 'S/N',
        totalSinImpuestos: subtotalSinImpuestos,
        totalDescuento: 0,
        totalConImpuestos: {
          totalImpuesto: [
            {
              codigo: 2,
              codigoPorcentaje: TAX_CONFIG.IVA.CODE,
              baseImponible: subtotalSinImpuestos,
              valor: valorIva
            }
          ]
        },
        propina: 0,
        importeTotal: importeTotal,
        moneda: 'DOLAR',
        pagos: {
          pago: [
            {
              formaPago: formaPago || '01', // '01' SIN UTILIZACION DEL SISTEMA FINANCIERO
              total: importeTotal,
              plazo: 1,
              unidadTiempo: 'dias'
            }
          ]
        }
      },
      detalles: { detalle: detalles },
      infoAdicional: {
        campoAdicional: [
          { nombre: 'Email', value: cliente.correo || 'N/A' },
          { nombre: 'Telefono', value: cliente.telefono || 'N/A' }
        ]
      }
    };

    // 8. Flujo SRI (osodreamer) y Logs
    let xmlUnsigned = '';
    let signedXml = '';
    let authResult = null;
    let errorTecnico = null;
    let sriTimeout = false;
    let internalCrash = false;
    let finalClaveAcceso = isNotaVenta ? numeroComprobanteCompleto : `NV-${Date.now()}`;
    let estadoFinalSri = isNotaVenta ? 'NOTA_DE_VENTA' : 'PENDIENTE_ENVIO';
    let rawSriResponse = null;
    let mensajesSri = [];
    let errorStack = null;
    let httpStatus = null;
    let soapFault = null;

    const startMs = performance.now(); // Medir tiempo de respuesta
    
    if (!isNotaVenta) {
      try {
        // 8.1 Generar XML (CPU Local)
        const invoiceResult = await generateXmlInvoice(invoiceData);
        xmlUnsigned = invoiceResult.generatedXml;
        const claveAccesoGenerada = invoiceResult.invoiceJson.factura.infoTributaria.claveAcceso;
        
        // Asignar clave generada para que no quede como FAIL-... si hay error después
        invoiceData.infoTributaria.claveAcceso = claveAccesoGenerada;

        // --- DIAGNÓSTICO P12 ---
        console.log(`--- INICIO DIAGNÓSTICO P12 ---`);
        console.log(`Tamaño del archivo P12 recibido: ${p12Buffer ? p12Buffer.length : 'UNDEFINED'} bytes`);
        if (p12Buffer) {
           try {
              const forge = require('node-forge');
              const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
              console.log('El archivo P12 se parseó correctamente como estructura ASN1 (binario válido).');
              
              const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);
              console.log('La contraseña ABRIÓ el certificado correctamente.');
              
              const safeBags = p12.safeContents.map(c => c.safeBags).flat();
              console.log('Bolsas (Bags) de seguridad encontradas:', safeBags.length);
              
              const aliases = safeBags
                  .map(bag => bag.attributes && bag.attributes.friendlyName ? bag.attributes.friendlyName[0] : null)
                  .filter(Boolean);
              console.log('Alias encontrados dentro del P12:', aliases);

           } catch (diagErr) {
              console.error('ERROR AL ABRIR EL CERTIFICADO DURANTE EL DIAGNÓSTICO:', diagErr.message);
              console.error('Stack trace del error de apertura del P12:', diagErr.stack);
           }
        }
        console.log(`--- FIN DIAGNÓSTICO P12 ---`);

        // 8.2 Firmar XML (CPU Local)
        const _diagNow = new Date();
        const _diagOffset = _diagNow.getTimezoneOffset();
        const _diagEcuador = new Date(_diagNow.getTime() - 5 * 3600000);
        console.log(`[TIMEZONE] Servidor UTC:       ${_diagNow.toISOString()}`);
        console.log(`[TIMEZONE] Servidor local:     ${_diagNow.toString()}`);
        console.log(`[TIMEZONE] getTimezoneOffset:  ${_diagOffset} min (esperado: 300 para ECU)`);
        console.log(`[TIMEZONE] process.env.TZ:     ${process.env.TZ || '(no definido)'}`);
        console.log(`[TIMEZONE] Hora Ecuador real:  ${_diagEcuador.toISOString().replace('Z', '-05:00')}`);

        signedXml = await signXml({
          p12Buffer: p12Buffer,
          password: p12Password,
          xmlBuffer: Buffer.from(xmlUnsigned, 'utf8')
        });
      } catch (e) {
        console.error("Error interno generando/firmando XML:", e);
        errorTecnico = "Fallo de Generación/Firma: " + e.message;
        errorStack = e.stack || null;
        
        if (e.errors) {
          errorTecnico += " | Errores de esquema: " + (typeof e.errors === 'string' ? e.errors : JSON.stringify(e.errors));
        }
        if (e.details) {
          errorTecnico += " | Detalles: " + (typeof e.details === 'string' ? e.details : JSON.stringify(e.details));
        }
        
        console.error("Stack trace de fallo interno:", e.stack);
        internalCrash = true;
        estadoFinalSri = 'ERROR_INTERNO';
      }

      if (!internalCrash) {
        const sriEnvConfig = (process.env.SRI_ENVIRONMENT || '').trim().toLowerCase();
        const isProdEnv = sriEnvConfig === 'production';
        const sriEnv = isProdEnv ? 'prod' : 'test';

        console.log(`[SRI BACKEND] ==========================================`);
        console.log(`[SRI BACKEND] SRI_ENVIRONMENT var: "${process.env.SRI_ENVIRONMENT}"`);
        console.log(`[SRI BACKEND] Modo evaluado: ${isProdEnv ? 'PRODUCCIÓN (2)' : 'PRUEBAS/TEST (1)'}`);
        console.log(`[SRI BACKEND] URL Recepción: https://${isProdEnv ? 'cel' : 'celcer'}.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl`);
        console.log(`[SRI BACKEND] URL Autorización: https://${isProdEnv ? 'cel' : 'celcer'}.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl`);
        console.log(`[SRI BACKEND] Clave de Acceso: ${invoiceData.infoTributaria.claveAcceso}`);
        console.log(`[SRI BACKEND] ==========================================`);

        try {
          // 8.3 Enviar (validar) y Autorizar SRI (Red/Internet)
          console.log(`[SRI STEP 1/2] Enviando XML a Recepción SOAP...`);
          const validateRes = await validateXml({ env: sriEnv, xml: Buffer.from(signedXml, 'utf8') });
          console.log(`[SRI STEP 1/2] ✅ XML recibido exitosamente por el SRI:`, validateRes);

          console.log(`[SRI STEP 2/2] Consultando Autorización SOAP...`);
          authResult = await authorizeXml({ claveAcceso: invoiceData.infoTributaria.claveAcceso, env: sriEnv });
          console.log(`[SRI STEP 2/2] ✅ Respuesta Autorización SRI:`, authResult);

          estadoFinalSri = authResult.estadoAutorizacion || authResult.estado || 'AUTORIZADO';
          rawSriResponse = authResult;
          mensajesSri = authResult.mensajes || [];

        } catch (e) {
          console.error("Excepción en comunicación SOAP con el SRI:", e);
          errorStack = e.stack || null;
          httpStatus = e.statusCode || e.status || e.response?.status || null;
          soapFault = e.soapFault || e.fault || null;

          // Clasificar tipo de error según respuesta del SRI
          if (e.constructor?.name === 'SRIRejectedError' || e.estado === 'DEVUELTA') {
            estadoFinalSri = 'DEVUELTA';
            const idMsg = e.identificador || 'SIN_ID';
            const mainMsg = e.mensaje || e.mensajeSRI || e.message || 'Comprobante devuelto por el SRI';
            const extraMsg = e.informacionAdicional || '';
            errorTecnico = `SRI DEVUELTA [${idMsg}]: ${mainMsg}${extraMsg ? ' - ' + extraMsg : ''}`;
            mensajesSri = [{ identificador: idMsg, mensaje: mainMsg, informacionAdicional: extraMsg, tipo: e.tipo || 'ERROR' }];
            rawSriResponse = { estado: 'DEVUELTA', identificador: idMsg, mensaje: mainMsg, informacionAdicional: extraMsg, tipo: e.tipo || 'ERROR', claveAcceso: e.claveAcceso || invoiceData.infoTributaria.claveAcceso, errorStack, httpStatus, soapFault };
            sriTimeout = false;

          } else if (e.constructor?.name === 'SRIAutorizacionError' || e.estado === 'NO AUTORIZADO' || e.estado === 'RECHAZADA') {
            estadoFinalSri = e.estado || 'NO_AUTORIZADO';
            const idMsg = e.identificador || 'SIN_ID';
            const mainMsg = e.mensaje || e.mensajeSRI || e.message || 'Comprobante no autorizado por el SRI';
            const extraMsg = e.informacionAdicional || '';
            errorTecnico = `SRI ${estadoFinalSri} [${idMsg}]: ${mainMsg}${extraMsg ? ' - ' + extraMsg : ''}`;
            mensajesSri = [{ identificador: idMsg, mensaje: mainMsg, informacionAdicional: extraMsg, tipo: e.tipo || 'ERROR' }];
            rawSriResponse = { estado: estadoFinalSri, identificador: idMsg, mensaje: mainMsg, informacionAdicional: extraMsg, tipo: e.tipo || 'ERROR', comprobanteXml: e.comprobanteXml || null, errorStack, httpStatus, soapFault };
            sriTimeout = false;

          } else if (e.constructor?.name === 'SRIUnauthorizedError') {
            estadoFinalSri = e.estado || 'NO_AUTORIZADO';
            errorTecnico = `SRI Autorización incompleta: estado ${estadoFinalSri}`;
            rawSriResponse = { estado: estadoFinalSri, error: errorTecnico, errorStack, httpStatus, soapFault };
            sriTimeout = false;

          } else {
            // Falla real de red, conexión rehusada o timeout SOAP
            sriTimeout = true;
            estadoFinalSri = 'PENDIENTE_ENVIO';
            errorTecnico = e.message || 'Sin respuesta del servidor SRI';
            if (e.errors) {
              errorTecnico += ' | Errores: ' + (typeof e.errors === 'string' ? e.errors : JSON.stringify(e.errors));
            }
            if (e.response && e.response.mensajes) {
              errorTecnico += ' | Mensajes SRI: ' + JSON.stringify(e.response.mensajes);
            }
            rawSriResponse = { error: errorTecnico, errorName: e.name || 'Error', errorStack, httpStatus, soapFault, response: e.response || null };
          }
        }
      }

      // Clave de Acceso final
      if (isNotaVenta) {
        finalClaveAcceso = `NV-${Date.now()}`;
      } else {
        finalClaveAcceso = (authResult && authResult.claveAcceso) ? authResult.claveAcceso : invoiceData.infoTributaria.claveAcceso !== 'GENERADA_AUTOMATICAMENTE_POR_OSODREAMER' ? invoiceData.infoTributaria.claveAcceso : `FAIL-${Date.now()}`;
      }
    }

    const endMs = performance.now();
    const latencyMs = Math.round(endMs - startMs);
    
    // 9. LOG de intento en sri_logs
    const logData = sanitizeFirestorePayload({
      timestamp: new Date().toISOString(),
      emisorId,
      cajeroUid: decodedToken.uid || 'UNKNOWN',
      ambiente: String(invoiceData.infoTributaria.ambiente),
      latenciaMs: latencyMs,
      numeroComprobante: numeroComprobanteCompleto,
      secuencial: secStr,
      xmlFirmado: signedXml || xmlUnsigned || 'NO_GENERADO',
      estadoLocal: sriTimeout ? 'TIMEOUT' : 'PROCESADO',
      estadoSri: estadoFinalSri || 'PENDIENTE_ENVIO',
      respuestaSri: rawSriResponse || authResult || {},
      errorTecnico: errorTecnico || '',
      errorStack: errorStack || null,
      httpStatus: httpStatus || null,
      soapFault: soapFault || null,
      transactionId: transactionId
    });

    console.log('--- LOG DATA QUE SE GUARDARÁ EN FIRESTORE ---');
    console.log(JSON.stringify(logData, null, 2));
    
    const batch = adminDb.batch();
    const logRef = adminDb.collection('sri_logs').doc(finalClaveAcceso);
    batch.set(logRef, logData);

    // 10. Actualizar Venta y Stock en Firestore
    const comprobanteData = sanitizeFirestorePayload({
      cliente,
      productos,
      subtotalSinImpuestos,
      valorIva,
      importeTotal,
      formaPago,
      paymentMethod: req.body.paymentMethod || (req.body.transferRecipient ? 'TRANSFERENCIA' : 'EFECTIVO'),
      transferRecipient: req.body.transferRecipient || null,
      paymentDetails: req.body.paymentDetails || {
        method: req.body.paymentMethod || (req.body.transferRecipient ? 'TRANSFERENCIA' : 'EFECTIVO'),
        cashAmount: (req.body.paymentMethod === 'EFECTIVO') ? (req.body.total || 0) : 0,
        transfers: req.body.transferRecipient ? [
          {
            recipientId: req.body.transferRecipientId || 'unknown',
            recipientName: req.body.transferRecipient,
            amount: req.body.total || 0,
            bank: req.body.transferBank || '',
            reference: req.body.transferReference || ''
          }
        ] : []
      },
      totals: {
        subtotal: subtotalSinImpuestos,
        ivaAmount: valorIva,
        total: importeTotal
      },
      emisorId,
      numeroComprobante: isNotaVenta ? 'S/N' : numeroComprobanteCompleto,
      establecimiento: estab,
      puntoEmision: ptoEmi,
      secuencial: isNotaVenta ? 'S/N' : secStr,
      claveAcceso: finalClaveAcceso,
      estadoVenta: 'FINALIZADA',
      estadoSri: estadoFinalSri || 'PENDIENTE_ENVIO', 
      numeroAutorizacion: (authResult && authResult.numeroAutorizacion) || (authResult && authResult.estadoAutorizacion === 'AUTORIZADO' ? finalClaveAcceso : null) || null,
      fechaAutorizacion: (authResult && authResult.fechaAutorizacion && (typeof authResult.fechaAutorizacion === 'string' || authResult.fechaAutorizacion instanceof Date)) ? authResult.fechaAutorizacion.toString() : (authResult ? new Date().toISOString() : null),
      mensajesSri: mensajesSri.length > 0 ? mensajesSri : ((authResult && authResult.mensajes) || []),
      xmlFirmado: signedXml || xmlUnsigned || null,
      xmlAutorizado: (authResult && (authResult.comprobante || authResult.xmlAutorizado)) || null,
      sriRawResponse: rawSriResponse || authResult || { error: errorTecnico || 'Desconocido' }, 
      errorTecnico: errorTecnico || null,
      errorStack: errorStack || null,
      httpStatus: httpStatus || null,
      soapFault: soapFault || null,
      fechaTransaccion: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      cajeroUid: decodedToken.uid || 'UNKNOWN',
      transactionId: transactionId,
      isNotaVenta: isNotaVenta
    });

    console.log('--- COMPROBANTE DATA QUE SE GUARDARÁ EN FIRESTORE ---');
    console.log(JSON.stringify(comprobanteData, null, 2));

    const nuevaVentaRef = adminDb.collection('ventas').doc(finalClaveAcceso);
    batch.set(nuevaVentaRef, comprobanteData);

    // REDUCCIÓN DE STOCK (SIEMPRE SE DESCUENTA UNA SOLA VEZ)
    for (const prod of productos) {
      const prodId = prod.id || prod.codigo;
      if (prodId && prodId !== 'CUSTOM_PRODUCT') {
        const prodRef = adminDb.collection('productos').doc(prodId);
        const pDoc = await prodRef.get();
        if (pDoc.exists) {
          const currentStock = pDoc.data().stock || 0;
          const newStock = Math.max(0, currentStock - (prod.cantidad || 1));
          batch.update(prodRef, { stock: newStock });
        }
      }
    }

    await batch.commit();

    if (internalCrash) {
      return res.status(500).json({
        success: false,
        claveAcceso: finalClaveAcceso,
        estado: 'ERROR_INTERNO',
        error: errorTecnico || 'Error fatal en la generación de la factura.',
        numeroComprobante: numeroComprobanteCompleto
      });
    }

    if (sriTimeout) {
      return res.status(200).json({ 
        success: false, 
        claveAcceso: finalClaveAcceso,
        estado: 'PENDIENTE_ENVIO',
        error: `Fallo de conexión SOAP con el SRI: ${errorTecnico || 'Sin respuesta'}. Se guardó localmente en estado PENDIENTE_ENVIO.`,
        numeroComprobante: numeroComprobanteCompleto
      });
    }

    if (estadoFinalSri === 'DEVUELTA' || estadoFinalSri === 'NO_AUTORIZADO' || estadoFinalSri === 'RECHAZADA') {
      return res.status(400).json({
        success: false,
        claveAcceso: finalClaveAcceso,
        estado: estadoFinalSri,
        error: errorTecnico || `La factura fue ${estadoFinalSri} por el SRI.`,
        mensajes: mensajesSri,
        numeroComprobante: numeroComprobanteCompleto,
        sriRawResponse: rawSriResponse
      });
    }

    return res.status(200).json({ 
      success: true, 
      claveAcceso: finalClaveAcceso, 
      estado: estadoFinalSri,
      mensajes: (authResult && authResult.mensajes) ? authResult.mensajes : [],
      numeroComprobante: isNotaVenta ? 'S/N' : numeroComprobanteCompleto
    });

  } catch (error) {
    console.error('Error in /api/sri/emitir:', error);
    
    // Extraer mensajes de error específicos de osodreamer si los hay
    let errMsg = error.message;
    if (error.response && error.response.mensajes) {
      errMsg = JSON.stringify(error.response.mensajes);
    }

    const contextType = req.body?.isNotaVenta ? 'nota de venta' : 'facturación SRI';
    return res.status(500).json({ 
      error: `Error procesando ${contextType}: ` + errMsg,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}
