import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
import { sendInvoiceEmail } from '../../../src/lib/mailer';
import { generateRidePdf } from '../../../src/lib/pdfGenerator';
import { TAX_CONFIG, calculateTotals, getCodigoPrincipal } from '../../../src/utils/taxes';
import { sanitizeFirestorePayload } from '../../../src/utils/sanitize';
import fs from 'fs';
import path from 'path';

// CRITICAL: Forzar zona horaria Ecuador y mitigar errores TLS IP SNI en Vercel
process.env.TZ = 'America/Guayaquil';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { generateXmlInvoice, signXml, validateXml, authorizeXml } = require('osodreamer-sri-xml-signer');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // 1. Validar autenticación
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Falta token.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (tokenErr) {
      return res.status(401).json({ error: 'Token de autenticación inválido o expirado.' });
    }

    // 2. Extraer ventaId
    const { ventaId } = req.body;
    if (!ventaId) {
      return res.status(400).json({ error: 'Falta ventaId del comprobante a convertir.' });
    }

    // 3. Buscar documento de la venta en Firestore
    const oldVentaRef = adminDb.collection('ventas').doc(ventaId);
    const oldVentaDoc = await oldVentaRef.get();
    if (!oldVentaDoc.exists) {
      return res.status(404).json({ error: 'La venta original no fue encontrada en Firestore.' });
    }

    const ventaData = oldVentaDoc.data();

    // Validar que no haya sido reemplazada previamente
    if (ventaData.status === 'REEMPLAZADO' || ventaData.estado === 'REEMPLAZADO') {
      return res.status(400).json({ 
        error: `Esta venta ya fue reemplazada por la factura ${ventaData.reemplazadoPor || ''}.` 
      });
    }

    // Extraer datos del cliente
    const cliente = ventaData.cliente || ventaData.customer || {};
    const ci = (cliente.numeroIdentificacion || '').trim();
    const tipoDoc = (cliente.tipoDocumento || '').trim().toUpperCase();

    if (!ci || ci === '9999999999999' || tipoDoc === 'CONSUMIDOR_FINAL' || cliente.nombre?.toUpperCase() === 'CONSUMIDOR FINAL') {
      return res.status(400).json({ 
        error: 'No se puede emitir una Factura Electrónica al SRI para Consumidor Final. Se requiere un cliente con RUC o Cédula válido.' 
      });
    }

    // Extraer productos y emisor
    const productos = ventaData.items || ventaData.productos || [];
    if (!productos || productos.length === 0) {
      return res.status(400).json({ error: 'La venta original no contiene productos para facturar.' });
    }

    const emisorId = ventaData.emisorId || ventaData.issuerId || 'hermano_geovanny';
    const emisorDoc = await adminDb.collection('issuers').doc(emisorId).get();
    if (!emisorDoc.exists) {
      return res.status(404).json({ error: `Emisor (${emisorId}) no encontrado en base de datos.` });
    }
    const emisor = emisorDoc.data();

    // 4. Cargar firma electrónica (.p12)
    let p12Buffer = null;
    const p12Password = emisor.passwordP12 || emisor.firmaPassword;

    if (emisor.p12Url || emisor.firmaUrl) {
      try {
        const fetchUrl = emisor.p12Url || emisor.firmaUrl;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        p12Buffer = Buffer.from(arrayBuffer);
        console.log(`[CONVERTIR NV] Firma electrónica cargada desde URL para ${emisor.name || emisor.razonSocial}.`);
      } catch (err) {
        console.error("Error al descargar firma desde URL:", err);
        return res.status(500).json({ error: 'No se pudo descargar la firma electrónica del emisor desde almacenamiento.' });
      }
    } else if (emisor.firmaPath) {
      const absoluteFirmaPath = path.resolve(process.cwd(), emisor.firmaPath);
      if (!fs.existsSync(absoluteFirmaPath)) {
        return res.status(404).json({ error: `Archivo de firma no encontrado en la ruta: ${emisor.firmaPath}` });
      }
      p12Buffer = fs.readFileSync(absoluteFirmaPath);
    } else {
      return res.status(400).json({ error: 'El emisor no tiene configurada una firma electrónica (.p12).' });
    }

    // 5. Reservar secuencial de factura de forma atómica
    const estab = emisor.estab || emisor.establecimiento || '001';
    const ptoEmi = emisor.ptoEmi || emisor.puntoEmision || '001';
    const secKey = `${estab}_${ptoEmi}`;

    let currentSecuencial = 1;
    const issuerRef = adminDb.collection('issuers').doc(emisorId);

    try {
      await adminDb.runTransaction(async (t) => {
        const docSnap = await t.get(issuerRef);
        if (!docSnap.exists) throw new Error('Emisor no encontrado en transacción.');
        const data = docSnap.data();
        const secuenciales = data.secuenciales || {};
        currentSecuencial = secuenciales[secKey] || 1;
        t.update(issuerRef, { [`secuenciales.${secKey}`]: currentSecuencial + 1 });
      });
      console.log(`🔒 [CONVERTIR NV - SECUENCIAL RESERVADO]: Reservado: ${currentSecuencial}, Siguiente: ${currentSecuencial + 1}`);
    } catch (reserveErr) {
      console.error("Error reservando secuencial de factura:", reserveErr);
      return res.status(500).json({ error: "Error de concurrencia al reservar secuencial: " + reserveErr.message });
    }

    const secStr = String(currentSecuencial).padStart(9, '0');
    const numeroComprobanteCompleto = `${estab}-${ptoEmi}-${secStr}`;
    const ambienteEmisor = (emisor.ambiente === '2' || process.env.SRI_ENVIRONMENT === 'production') ? 2 : 1;

    // 6. Calcular montos e impuestos
    const totalsCalc = calculateTotals(productos, ventaData.vatIncluded !== false, false);
    const formaPagoSri = (ventaData.paymentMethod === 'EFECTIVO') ? '01' : '20';

    const invoiceData = {
      infoTributaria: {
        ambiente: ambienteEmisor,
        tipoEmision: 1,
        razonSocial: emisor.razonSocial || emisor.name,
        nombreComercial: emisor.nombreComercial || emisor.name || 'GRAVITY DENIM',
        ruc: emisor.ruc,
        claveAcceso: 'GENERADA_AUTOMATICAMENTE_POR_OSODREAMER',
        codDoc: '01',
        estab: estab,
        ptoEmi: ptoEmi,
        secuencial: secStr,
        dirMatriz: emisor.direccionMatriz || 'Av. Maldonado y Quimiag'
      },
      infoFactura: {
        fechaEmision: new Date().toLocaleDateString('es-EC'),
        dirEstablecimiento: emisor.direccionEstablecimiento || emisor.direccionMatriz,
        obligadoContabilidad: emisor.obligadoContabilidad ? 'SI' : 'NO',
        tipoIdentificacionComprador: tipoDoc === 'CEDULA' ? '05' : tipoDoc === 'RUC' ? '04' : '06',
        razonSocialComprador: cliente.nombre,
        identificacionComprador: cliente.numeroIdentificacion,
        direccionComprador: cliente.direccion || 'S/N',
        totalSinImpuestos: totalsCalc.subtotal,
        totalDescuento: 0,
        totalConImpuestos: {
          totalImpuesto: [
            {
              codigo: 2,
              codigoPorcentaje: TAX_CONFIG.IVA.CODE,
              baseImponible: totalsCalc.subtotal,
              valor: totalsCalc.ivaAmount
            }
          ]
        },
        propina: 0,
        importeTotal: totalsCalc.total,
        moneda: 'DOLAR',
        pagos: {
          pago: [
            {
              formaPago: formaPagoSri,
              total: totalsCalc.total,
              plazo: (ventaData.paymentMethod === 'CREDITO' || ventaData.isCredito) ? 30 : 1,
              unidadTiempo: 'dias'
            }
          ]
        }
      },
      detalles: {
        detalle: totalsCalc.detalles.map(d => ({
          codigoPrincipal: d.codigoPrincipal || getCodigoPrincipal(d),
          descripcion: d.nombre,
          cantidad: Number(d.qty).toFixed(6),
          precioUnitario: Number(d.precioUnitario).toFixed(6),
          descuento: 0,
          precioTotalSinImpuesto: Number(d.precioTotalSinImpuesto).toFixed(2),
          impuestos: {
            impuesto: [
              {
                codigo: 2,
                codigoPorcentaje: TAX_CONFIG.IVA.CODE,
                tarifa: TAX_CONFIG.IVA.RATE,
                baseImponible: d.precioTotalSinImpuesto,
                valor: d.iva
              }
            ]
          }
        }))
      }
    };

    // 7. Generar y firmar el XML
    const invoiceResult = await generateXmlInvoice(invoiceData);
    const xmlUnsigned = invoiceResult.generatedXml;
    const finalClaveAcceso = invoiceResult.invoiceJson.factura.infoTributaria.claveAcceso;

    const signedXml = await signXml({
      p12Buffer: p12Buffer,
      password: p12Password,
      xmlBuffer: Buffer.from(xmlUnsigned, 'utf8')
    });

    const sriEnv = ambienteEmisor === 2 ? 'prod' : 'test';
    let estadoFinalSri = 'PENDIENTE_ENVIO';
    let authResult = null;
    let errorTecnico = null;

    // 8. Enviar a Recepción y Autorización del SRI
    try {
      await validateXml({ env: sriEnv, xml: Buffer.from(signedXml, 'utf8') });
      await new Promise(resolve => setTimeout(resolve, 2000));
      authResult = await authorizeXml({ claveAcceso: finalClaveAcceso, env: sriEnv });
      estadoFinalSri = authResult.estadoAutorizacion || authResult.estado || 'AUTORIZADO';
    } catch (sriErr) {
      console.error("Error en comunicación con SRI durante conversión:", sriErr);
      estadoFinalSri = 'PENDIENTE_ENVIO';
      errorTecnico = sriErr.message;
    }

    // 9. Guardar la nueva Factura y reemplazar la Nota de Venta (sin alterar stock)
    const batch = adminDb.batch();
    const nuevaVentaRef = adminDb.collection('ventas').doc(finalClaveAcceso);

    const comprobanteData = sanitizeFirestorePayload({
      ...ventaData,
      id: finalClaveAcceso,
      claveAcceso: finalClaveAcceso,
      numeroComprobante: numeroComprobanteCompleto,
      secuencial: secStr,
      establecimiento: estab,
      puntoEmision: ptoEmi,
      isNotaVenta: false,
      tipoComprobante: 'FACTURA',
      estado: estadoFinalSri,
      status: estadoFinalSri,
      estadoSri: estadoFinalSri,
      xmlFirmado: signedXml,
      xmlAutorizado: (authResult && (authResult.comprobante || authResult.xmlAutorizado)) || null,
      numeroAutorizacion: (authResult && authResult.numeroAutorizacion) || (estadoFinalSri === 'AUTORIZADO' ? finalClaveAcceso : null),
      fechaAutorizacion: authResult?.fechaAutorizacion ? String(authResult.fechaAutorizacion) : (estadoFinalSri === 'AUTORIZADO' ? new Date().toISOString() : null),
      sriResponse: authResult ? {
        status: estadoFinalSri,
        numeroAutorizacion: finalClaveAcceso,
        fechaAutorizacion: authResult.fechaAutorizacion || new Date().toISOString()
      } : null,
      errorTecnico: errorTecnico,
      reemplazaA: ventaId,
      origen: 'CONVERSION_NV',
      // Preservar la información de Crédito y Cuentas por Cobrar
      isCredito: ventaData.isCredito || ventaData.paymentMethod === 'CREDITO' || (ventaData.paymentDetails?.creditAmount > 0),
      creditAmount: ventaData.creditAmount || ventaData.totals?.total || ventaData.total || totalsCalc.total,
      saldoPendiente: ventaData.saldoPendiente || ventaData.totals?.total || ventaData.total || totalsCalc.total,
      totalPagadoCredito: ventaData.totalPagadoCredito || 0,
      estadoCredito: ventaData.estadoCredito || 'PENDIENTE',
      paymentMethod: ventaData.paymentMethod || 'CREDITO'
    });

    batch.set(nuevaVentaRef, comprobanteData);

    // Marcar la Nota de Venta anterior como REEMPLAZADO
    batch.update(oldVentaRef, {
      estado: 'REEMPLAZADO',
      status: 'REEMPLAZADO',
      reemplazadoPor: finalClaveAcceso,
      nuevoNumeroComprobante: numeroComprobanteCompleto,
      fechaReemplazo: new Date().toISOString()
    });

    // Si existen cobros/abonos previos registrados para esta venta, reasignarlos a la nueva factura
    const cobrosSnap = await adminDb.collection('cobros').where('ventaId', '==', ventaId).get();
    cobrosSnap.forEach(cDoc => {
      batch.update(cDoc.ref, {
        ventaId: finalClaveAcceso,
        numeroComprobante: numeroComprobanteCompleto
      });
    });

    await batch.commit();
    console.log(`✅ [CONVERSIÓN EXITOSA]: Nota de Venta ${ventaId} convertida a Factura ${numeroComprobanteCompleto} (${finalClaveAcceso}). Estado SRI: ${estadoFinalSri}`);

    // 10. Envío de Correo con RIDE PDF (en segundo plano / no bloqueante si falla)
    const customerEmail = cliente.correo || cliente.email;
    if (customerEmail && customerEmail !== 'N/A' && customerEmail.trim() !== '' && !customerEmail.toLowerCase().includes('consumidorfinal')) {
      try {
        console.log(`📧 [CONVERTIR NV] Generando RIDE PDF para enviar a ${customerEmail}...`);
        const pdfBuffer = await generateRidePdf({
          issuerData: emisor,
          customer: cliente,
          cart: totalsCalc.detalles.map(d => ({
            id: d.id,
            sku: d.sku || '',
            name: d.nombre,
            qty: d.qty,
            price: d.precioUnitario,
            precioTotalSinImpuesto: d.precioTotalSinImpuesto
          })),
          totalsData: {
            subtotal: totalsCalc.subtotal,
            baseImponible: totalsCalc.baseImponible,
            ivaAmount: totalsCalc.ivaAmount,
            total: totalsCalc.total
          },
          claveAcceso: finalClaveAcceso,
          numeroComprobante: numeroComprobanteCompleto,
          fecha: new Date(),
          paymentDetails: ventaData.paymentDetails || null
        });

        const xmlContent = (authResult && (authResult.comprobante || authResult.xmlAutorizado)) || signedXml || '';

        await sendInvoiceEmail({
          customerEmail,
          pdfBuffer,
          xmlBuffer: xmlContent,
          claveAcceso: finalClaveAcceso,
          issuerName: emisor.name || emisor.razonSocial || 'GRAVITY DENIM',
          numeroComprobante: numeroComprobanteCompleto
        });
        console.log(`✉️ Correo enviado exitosamente a ${customerEmail}`);
      } catch (mailErr) {
        console.error("Error enviando email tras conversión:", mailErr);
      }
    }

    return res.status(200).json({
      success: true,
      claveAcceso: finalClaveAcceso,
      numeroComprobante: numeroComprobanteCompleto,
      estado: estadoFinalSri,
      message: estadoFinalSri === 'AUTORIZADO'
        ? `Factura ${numeroComprobanteCompleto} emitida y AUTORIZADA por el SRI con éxito.`
        : `Factura ${numeroComprobanteCompleto} generada con Clave ${finalClaveAcceso}. Estado: ${estadoFinalSri}.`
    });

  } catch (error) {
    console.error('Error general en conversión de Nota de Venta a Factura:', error);
    return res.status(500).json({ error: 'Error interno en conversión: ' + error.message });
  }
}
