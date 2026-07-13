import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
const { validateXml, authorizeXml } = require('osodreamer-sri-xml-signer');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    let token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    token = token.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    const { claveAcceso } = req.body;
    if (!claveAcceso) {
      return res.status(400).json({ error: 'Falta claveAcceso' });
    }

    const adminDb = getAdminDb();
    
    // Obtener la venta original
    const ventaRef = adminDb.collection('ventas').doc(claveAcceso);
    const ventaDoc = await ventaRef.get();
    
    if (!ventaDoc.exists) {
      return res.status(404).json({ error: 'La factura no existe en el sistema' });
    }

    const ventaData = ventaDoc.data();

    // Solo permitir reintentos si no está autorizada
    if (ventaData.estadoSri === 'AUTORIZADO') {
      return res.status(400).json({ error: 'La factura ya se encuentra autorizada' });
    }
    
    if (!ventaData.xmlFirmado || ventaData.xmlFirmado === 'NO_GENERADO') {
      return res.status(400).json({ error: 'No existe XML firmado guardado para reintentar. Genera la factura nuevamente.' });
    }

    const emisorId = ventaData.emisorId;
    if (!emisorId) {
       return res.status(400).json({ error: 'No se encontró el emisorId en la venta.' });
    }

    const issuerDoc = await adminDb.collection('issuers').doc(emisorId).get();
    if (!issuerDoc.exists) {
       return res.status(404).json({ error: 'Emisor no encontrado' });
    }
    
    const issuerData = issuerDoc.data();
    // 1 para pruebas, 2 para producción (asumiendo que viene del frontend o por defecto 1)
    const ambiente = issuerData.ambiente || 1;
    const sriEnv = ambiente === 1 ? 'test' : 'prod';

    let errorTecnico = null;
    let authResult = null;
    let sriTimeout = false;

    console.log(`Reintentando envío SRI para clave: ${claveAcceso} en ambiente: ${sriEnv}`);

    try {
      await validateXml({ env: sriEnv, xml: Buffer.from(ventaData.xmlFirmado, 'utf8') });
      authResult = await authorizeXml({ claveAcceso, env: sriEnv });
    } catch (e) {
      console.error("Error técnico contactando al SRI en REINTENTO:", e);
      errorTecnico = e.message;
      if (e.errors) {
         errorTecnico += ': ' + JSON.stringify(e.errors);
      }
      if (e.response && e.response.mensajes) {
         errorTecnico = JSON.stringify(e.response.mensajes);
      }
      sriTimeout = true;
    }

    let estadoFinalSri = 'EN_PROCESO';
    if (authResult) {
      estadoFinalSri = authResult.estado; 
    } else if (sriTimeout) {
      estadoFinalSri = 'PENDIENTE_ENVIO'; // Se mantiene pendiente
    }

    // Actualizar el documento original
    await ventaRef.update({
      estadoSri: estadoFinalSri,
      numeroAutorizacion: (authResult && authResult.numeroAutorizacion) ? authResult.numeroAutorizacion : ventaData.numeroAutorizacion,
      fechaAutorizacion: (authResult && authResult.fechaAutorizacion) ? authResult.fechaAutorizacion : ventaData.fechaAutorizacion,
      mensajesSri: (authResult && authResult.mensajes) ? authResult.mensajes : ventaData.mensajesSri,
      xmlAutorizado: (authResult && (authResult.comprobante || authResult.xmlAutorizado)) ? (authResult.comprobante || authResult.xmlAutorizado) : ventaData.xmlAutorizado,
      sriRawResponse: authResult || errorTecnico,
      ultimoReintento: new Date().toISOString()
    });

    // Registrar el LOG del reintento
    const logRef = adminDb.collection('sri_logs').doc(`${claveAcceso}-reintento-${Date.now()}`);
    await logRef.set({
      timestamp: new Date().toISOString(),
      emisorId,
      cajeroUid: decodedToken.uid,
      ambiente: sriEnv,
      numeroComprobante: ventaData.numeroComprobante,
      secuencial: ventaData.secuencial,
      xmlFirmado: ventaData.xmlFirmado,
      estadoLocal: sriTimeout ? 'TIMEOUT_REINTENTO' : 'PROCESADO',
      estadoSri: estadoFinalSri,
      respuestaSri: authResult || null,
      errorTecnico: errorTecnico || null,
      esReintento: true,
      claveOriginal: claveAcceso
    });

    if (sriTimeout) {
      return res.status(200).json({ 
        success: false, 
        claveAcceso,
        estado: 'PENDIENTE_ENVIO',
        error: errorTecnico || 'El SRI rechazó la conexión o no respondió en el reintento.'
      });
    }

    return res.status(200).json({ 
      success: true, 
      claveAcceso, 
      estado: estadoFinalSri,
      mensajes: (authResult && authResult.mensajes) ? authResult.mensajes : []
    });

  } catch (error) {
    console.error('Error in /api/sri/reintentar:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor en reintento' });
  }
}
