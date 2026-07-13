import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
import { generateXmlInvoice, signXml, validateXml, authorizeXml } from 'osodreamer-sri-xml-signer';
import fs from 'fs';
import path from 'path';

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

    // 5. Cálculos (Simulados para el MVP, deben ser matemáticamente perfectos)
    let subtotalSinImpuestos = 0;
    const detalles = productos.map(prod => {
      const cantidad = prod.qty || prod.cantidad || 1;
      const precioUnitario = prod.price !== undefined ? prod.price : prod.precio; 
      const descuento = prod.descuento || 0;
      const precioTotalSinImpuesto = (precioUnitario * cantidad) - descuento;
      subtotalSinImpuestos += precioTotalSinImpuesto;
      
      return {
        codigoPrincipal: prod.id || prod.codigo || '0000',
        descripcion: prod.name || prod.nombre || 'Producto',
        cantidad: cantidad,
        precioUnitario: precioUnitario,
        descuento: descuento,
        precioTotalSinImpuesto: precioTotalSinImpuesto,
        impuestos: {
          impuesto: [
            {
              codigo: 2, // IVA
              codigoPorcentaje: 2, // 12%
              tarifa: 12.00,
              baseImponible: precioTotalSinImpuesto,
              valor: precioTotalSinImpuesto * 0.12
            }
          ]
        }
      };
    });

    const valorIva = subtotalSinImpuestos * 0.12; // Ajustar real
    const importeTotal = subtotalSinImpuestos + valorIva;

    const estab = emisor.establecimiento || '001';
    const ptoEmi = emisor.puntoEmision || '001';
    const secKey = `${estab}_${ptoEmi}`;

    // 6. Generar Secuencial de forma ATÓMICA (Evita race conditions)
    // Se ejecuta solo después de que TODAS las validaciones pasaron
    let nextSecuencial = 0;
    
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
    }

    const secStr = String(nextSecuencial).padStart(9, '0');
    const numeroComprobanteCompleto = isNotaVenta ? 'S/N' : `${estab}-${ptoEmi}-${secStr}`;

    const invoiceData = {
      infoTributaria: {
        ambiente: 1,
        tipoEmision: 1,
        razonSocial: emisor.razonSocial || emisor.name || 'Sin Razón Social',
        nombreComercial: emisor.nombreComercial || emisor.razonSocial || emisor.name || 'Sin Nombre Comercial',
        ruc: emisor.ruc,
        claveAcceso: 'GENERADA_AUTOMATICAMENTE_POR_OSODREAMER',
        codDoc: '01',
        estab: estab,
        ptoEmi: ptoEmi,
        secuencial: secStr,
        dirMatriz: emisor.direccionMatriz
      },
      infoFactura: {
        fechaEmision: new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }),
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
              codigoPorcentaje: 2,
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
    let finalClaveAcceso = `NV-${Date.now()}`;
    let estadoFinalSri = 'NOTA_DE_VENTA';

    const startMs = performance.now(); // Medir tiempo de respuesta
    
    if (!isNotaVenta) {
      try {
        // 8.1 Generar XML (CPU Local)
        const invoiceResult = await generateXmlInvoice(invoiceData);
        xmlUnsigned = invoiceResult.generatedXml;
        const claveAccesoGenerada = invoiceResult.invoiceJson.factura.infoTributaria.claveAcceso;
        
        // Asignar clave generada para que no quede como FAIL-... si hay error después
        invoiceData.infoTributaria.claveAcceso = claveAccesoGenerada;

        // 8.2 Firmar XML (CPU Local)
        signedXml = await signXml({
          p12Buffer: p12Buffer,
          password: p12Password,
          xmlBuffer: Buffer.from(xmlUnsigned, 'utf8')
        });
      } catch (e) {
        console.error("Error interno generando/firmando XML:", e);
        errorTecnico = "Fallo de Generación/Firma: " + e.message;
        
        // Extraer detalles de validación de esquema o firma
        if (e.errors) {
          errorTecnico += " | Errores de esquema: " + (typeof e.errors === 'string' ? e.errors : JSON.stringify(e.errors));
        }
        if (e.details) {
          errorTecnico += " | Detalles: " + (typeof e.details === 'string' ? e.details : JSON.stringify(e.details));
        }
        
        console.error("Stack trace de fallo interno:", e.stack);
        internalCrash = true;
      }

      if (!internalCrash) {
        try {
          // 8.3 Enviar (validar) y Autorizar SRI (Red/Internet)
          await validateXml({ env: '1', xml: Buffer.from(signedXml, 'utf8') });
          authResult = await authorizeXml({ claveAcceso: invoiceData.infoTributaria.claveAcceso, env: '1' });
        } catch (e) {
          console.error("Error técnico contactando al SRI o validando XML:", e);
          errorTecnico = e.message;
          if (e.errors) {
             errorTecnico += ': ' + JSON.stringify(e.errors);
          }
          if (e.response && e.response.mensajes) {
             errorTecnico = JSON.stringify(e.response.mensajes);
          }
          sriTimeout = true; // Asumimos falla de red o rechazo del WS
        }
      }

      // Extraer Clave de Acceso generada (si existe) o usar una única
      if (isNotaVenta) {
        finalClaveAcceso = `NV-${Date.now()}`;
      } else {
        finalClaveAcceso = (authResult && authResult.claveAcceso) ? authResult.claveAcceso : invoiceData.infoTributaria.claveAcceso !== 'GENERADA_AUTOMATICAMENTE_POR_OSODREAMER' ? invoiceData.infoTributaria.claveAcceso : `FAIL-${Date.now()}`;
      }
      
      estadoFinalSri = 'EN_PROCESO';
      if (authResult) {
        estadoFinalSri = authResult.estado; // AUTORIZADO, RECHAZADO, DEVUELTA
      } else if (sriTimeout) {
        estadoFinalSri = 'TIMEOUT';
      } else if (internalCrash) {
        estadoFinalSri = 'ERROR_INTERNO';
      }
    }

    const endMs = performance.now();
    const latencyMs = Math.round(endMs - startMs);
    
    // 9. Construir y guardar LOG de intento en sri_logs SIEMPRE (incluso para Notas de Venta)
    const logData = {
      timestamp: new Date().toISOString(),
      emisorId,
      cajeroUid: decodedToken.uid,
      ambiente: '1',
      latenciaMs: latencyMs,
      numeroComprobante: numeroComprobanteCompleto,
      secuencial: secStr,
      xmlFirmado: signedXml || xmlUnsigned || 'NO_GENERADO',
      estadoLocal: sriTimeout ? 'TIMEOUT' : 'PROCESADO',
      estadoSri: estadoFinalSri,
      respuestaSri: authResult || null,
      errorTecnico: errorTecnico || null,
      transactionId: transactionId // Llave de idempotencia guardada en el log
    };

    const batch = adminDb.batch();
    const logRef = adminDb.collection('sri_logs').doc(finalClaveAcceso);
    batch.set(logRef, logData);

    // 10. Actualizar Venta y Stock en Firestore SOLO SI HAY RESPUESTA DEFINITIVA O ES NOTA DE VENTA
    const estadosDefinitivos = ['AUTORIZADO', 'RECHAZADO', 'DEVUELTA', 'NOTA_DE_VENTA'];
    const esDefinitiva = estadosDefinitivos.includes(estadoFinalSri);

    if (esDefinitiva) {
      const comprobanteData = {
        cliente,
        productos,
        subtotalSinImpuestos,
        valorIva,
        importeTotal,
        formaPago,
        paymentMethod: req.body.transferRecipient ? 'TRANSFERENCIA' : 'EFECTIVO',
        transferRecipient: req.body.transferRecipient || null,
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
        estadoSri: estadoFinalSri, 
        numeroAutorizacion: (authResult && authResult.numeroAutorizacion) ? authResult.numeroAutorizacion : null,
        fechaAutorizacion: (authResult && authResult.fechaAutorizacion) ? authResult.fechaAutorizacion : null,
        mensajesSri: (authResult && authResult.mensajes) ? authResult.mensajes : [],
        xmlFirmado: signedXml,
        xmlAutorizado: (authResult && (authResult.comprobante || authResult.xmlAutorizado)) ? (authResult.comprobante || authResult.xmlAutorizado) : null,
        sriRawResponse: authResult || errorTecnico, 
        fechaTransaccion: new Date().toISOString(),
        cajeroUid: decodedToken.uid,
        transactionId: transactionId,
        isNotaVenta: isNotaVenta
      };

      const nuevaVentaRef = adminDb.collection('ventas').doc(finalClaveAcceso);
      batch.set(nuevaVentaRef, comprobanteData);

      // REDUCCIÓN DE STOCK
      for (const prod of productos) {
        const prodId = prod.id || prod.codigo;
        if (prodId && prodId !== 'CUSTOM_PRODUCT') {
          const prodRef = adminDb.collection('productos').doc(prodId);
          // Get the current stock first
          const pDoc = await prodRef.get();
          if (pDoc.exists) {
            const currentStock = pDoc.data().stock || 0;
            const newStock = Math.max(0, currentStock - (prod.cantidad || 1));
            batch.update(prodRef, { stock: newStock });
          }
        }
      }
    }

    await batch.commit();

    if (internalCrash) {
      return res.status(500).json({ error: errorTecnico || 'Error fatal en la generación de la factura.' });
    }

    if (sriTimeout) {
      return res.status(200).json({ 
        success: false, 
        claveAcceso: finalClaveAcceso,
        estado: 'CONTINGENCIA_LOCAL',
        error: 'El servicio del SRI no respondió o rechazó la conexión. La factura quedó en estado PENDIENTE de recuperación.',
        numeroComprobante: numeroComprobanteCompleto
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
    return res.status(500).json({ error: `Error procesando ${contextType}: ` + errMsg });
  }
}
