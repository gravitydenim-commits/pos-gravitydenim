import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
import { sendInvoiceEmail } from '../../../src/lib/mailer';
import { generateRidePdf } from '../../../src/lib/pdfGenerator';
import { TAX_CONFIG, calculateTotals } from '../../../src/utils/taxes';
import { sanitizeFirestorePayload } from '../../../src/utils/sanitize';

// CRITICAL: Forzar zona horaria Ecuador y mitigar errores TLS IP SNI en Vercel
process.env.TZ = 'America/Guayaquil';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { generateXmlInvoice, signXml, validateXml, authorizeXml } = require('osodreamer-sri-xml-signer');
import fs from 'fs';
import path from 'path';

const round2 = (val) => Number(Number(val).toFixed(2));
const pad2 = (n) => String(n).padStart(2, '0');

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

    // 2. Extraer claveAcceso de la factura fallida
    const { claveAcceso } = req.body;
    if (!claveAcceso) {
      return res.status(400).json({ error: 'Falta claveAcceso de la factura a reemitir' });
    }

    // 3. Obtener la venta fallida de Firestore
    const oldVentaRef = adminDb.collection('ventas').doc(claveAcceso);
    const oldVentaDoc = await oldVentaRef.get();
    if (!oldVentaDoc.exists) {
      return res.status(404).json({ error: 'La venta original no fue encontrada en Firestore' });
    }

    const ventaData = oldVentaDoc.data();
    
    // Extraer cliente, productos, emisorId, formaPago
    const cliente = ventaData.cliente;
    const productos = ventaData.items || ventaData.productos || [];
    const emisorId = ventaData.emisorId || ventaData.issuerId || 'hermano_carlos';
    const formaPago = ventaData.formaPago || (ventaData.paymentDetails?.payments?.[0]?.sriPaymentMethod) || '01';
    const isNotaVenta = ventaData.isNotaVenta === true;

    if (isNotaVenta) {
      return res.status(400).json({ error: 'Las Notas de Venta no se pueden reemitir con este flujo' });
    }

    // 4. Obtener datos del emisor
    const emisorDoc = await adminDb.collection('issuers').doc(emisorId).get();
    if (!emisorDoc.exists) {
      return res.status(404).json({ error: 'Emisor no encontrado' });
    }
    const emisor = emisorDoc.data();

    // 5. Validar firma electrónica P12
    if (!emisor.firmaPath && !emisor.firmaUrl) {
      return res.status(400).json({ error: 'El emisor no tiene cargado un archivo de firma electrónica (.p12)' });
    }

    let p12Buffer = null;
    const p12Password = emisor.firmaPassword;

    if (emisor.firmaUrl) {
      try {
        const response = await fetch(emisor.firmaUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        p12Buffer = Buffer.from(arrayBuffer);
        console.log(`Firma cargada exitosamente desde URL para reemisión.`);
      } catch (err) {
        console.error("Error al descargar firma desde URL:", err);
        return res.status(500).json({ error: 'No se pudo descargar la firma electrónica desde el servidor de almacenamiento.' });
      }
    } else {
      const absoluteFirmaPath = path.resolve(process.cwd(), emisor.firmaPath);
      if (!fs.existsSync(absoluteFirmaPath)) {
        return res.status(404).json({ error: `Archivo de firma no encontrado en la ruta del servidor: ${emisor.firmaPath}` });
      }
      p12Buffer = fs.readFileSync(absoluteFirmaPath);
    }

    // 6. Reservar un NUEVO secuencial de forma atómica
    const estab = emisor.estab || emisor.establecimiento || '001';
    const ptoEmi = emisor.ptoEmi || emisor.puntoEmision || '100';
    const secKey = `${estab}_${ptoEmi}`;
    
    let currentSecuencial = 1;
    const issuerRef = adminDb.collection('issuers').doc(emisorId);
    
    try {
      await adminDb.runTransaction(async (t) => {
        const docSnap = await t.get(issuerRef);
        if (!docSnap.exists) {
          throw new Error('Emisor no encontrado');
        }
        const data = docSnap.data();
        const secuenciales = data.secuenciales || {};
        currentSecuencial = secuenciales[secKey] || 1;
        t.update(issuerRef, { [`secuenciales.${secKey}`]: currentSecuencial + 1 });
      });
      console.log(`🔒 [REEMISIÓN - SECUENCIAL RESERVADO]: Reservado: ${currentSecuencial}, Siguiente: ${currentSecuencial + 1}`);
    } catch (reserveErr) {
      console.error("Error reservando secuencial para reemisión:", reserveErr);
      return res.status(500).json({ error: "Error de concurrencia al reservar secuencial para reemisión: " + reserveErr.message });
    }

    const secStr = String(currentSecuencial).padStart(9, '0');
    const numeroComprobanteCompleto = `${estab}-${ptoEmi}-${secStr}`;
    const ambienteEmisor = (emisor.ambiente === '2' || process.env.SRI_ENVIRONMENT === 'production') ? 2 : 1;

    // Calcular montos de impuestos
    const totalsCalc = calculateTotals(productos, ventaData.vatIncluded !== false, false);
    
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
        dirMatriz: emisor.direccionMatriz || 'Av. maldonado y Quimiag'
      },
      infoFactura: {
        fechaEmision: new Date().toLocaleDateString('es-EC').replace(/\//g, '/'),
        dirEstablecimiento: emisor.direccionEstablecimiento || emisor.direccionMatriz,
        obligadoContabilidad: emisor.obligadoContabilidad ? 'SI' : 'NO',
        tipoIdentificacionComprador: cliente.tipoDocumento === 'CEDULA' ? '05' : cliente.tipoDocumento === 'RUC' ? '04' : cliente.tipoDocumento === 'CONSUMIDOR_FINAL' ? '07' : '06',
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
              formaPago: formaPago,
              total: totalsCalc.total
            }
          ]
        }
      },
      detalles: {
        detalle: totalsCalc.detalles.map(d => ({
          codigoPrincipal: d.sku || d.id || 'CUSTOM',
          descripcion: d.nombre,
          cantidad: d.qty.toFixed(6),
          precioUnitario: d.precioUnitario.toFixed(6),
          descuento: 0,
          precioTotalSinImpuesto: d.precioTotalSinImpuesto.toFixed(2),
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
      await new Promise(resolve => setTimeout(resolve, 1500));
      authResult = await authorizeXml({ claveAcceso: finalClaveAcceso, env: sriEnv });
      estadoFinalSri = authResult.estadoAutorizacion || authResult.estado || 'AUTORIZADO';
    } catch (sriErr) {
      console.error("Error en comunicación con SRI durante reemisión:", sriErr);
      estadoFinalSri = 'PENDIENTE_ENVIO';
      errorTecnico = sriErr.message;
    }

    // 9. Guardar la nueva venta autorizada
    const batch = adminDb.batch();
    const nuevaVentaRef = adminDb.collection('ventas').doc(finalClaveAcceso);

    const comprobanteData = sanitizeFirestorePayload({
      ...ventaData,
      claveAcceso: finalClaveAcceso,
      numeroComprobante: numeroComprobanteCompleto,
      estado: estadoFinalSri,
      xmlFirmado: signedXml,
      xmlAutorizado: (authResult && (authResult.comprobante || authResult.xmlAutorizado)) || null,
      sriResponse: authResult ? {
        status: estadoFinalSri,
        numeroAutorizacion: finalClaveAcceso,
        fechaAutorizacion: authResult.fechaAutorizacion || new Date().toISOString()
      } : null,
      errorTecnico: errorTecnico
    });

    batch.set(nuevaVentaRef, comprobanteData);
    
    // 10. Eliminar el documento anterior fallido
    batch.delete(oldVentaRef);

    await batch.commit();
    console.log(`✅ [REEMISIÓN EXITOSA]: Nueva clave de acceso: ${finalClaveAcceso}. Antigua clave ${claveAcceso} eliminada.`);

    return res.status(200).json({
      success: true,
      claveAcceso: finalClaveAcceso,
      numeroComprobante: numeroComprobanteCompleto,
      estado: estadoFinalSri,
      message: estadoFinalSri === 'AUTORIZADO' ? 'Factura reemitida y autorizada con éxito.' : 'Factura reemitida, pendiente de autorización por el SRI.'
    });

  } catch (error) {
    console.error('Error durante la reemisión de la factura:', error);
    return res.status(500).json({ error: 'Error interno en reemisión: ' + error.message });
  }
}
