import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
const { validateXml, authorizeXml } = require('osodreamer-sri-xml-signer');
import { sanitizeFirestorePayload } from '../../../src/utils/sanitize';

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
    const sriEnvConfig = (process.env.SRI_ENVIRONMENT || '').trim().toLowerCase();
    const isProdEnv = sriEnvConfig === 'production';
    const sriEnv = isProdEnv ? 'prod' : 'test';

    let errorTecnico = null;
    let authResult = null;
    let sriTimeout = false;
    let estadoFinalSri = 'PENDIENTE_ENVIO';
    let rawSriResponse = null;
    let mensajesSri = [];
    let errorStack = null;
    let httpStatus = null;
    let soapFault = null;

    console.log(`[SRI REINTENTO] Clave: ${claveAcceso} | Modo: ${isProdEnv ? 'PRODUCCIÓN' : 'PRUEBAS'} (${sriEnv})`);

    try {
      try {
        console.log(`[SRI REINTENTO STEP 1/2] Enviando XML a Recepción...`);
        const validateRes = await validateXml({ env: sriEnv, xml: Buffer.from(ventaData.xmlFirmado, 'utf8') });
        console.log(`[SRI REINTENTO STEP 1/2] ✅ XML recibido en Recepción SRI:`, validateRes);
        await new Promise(r => setTimeout(r, 2000));
      } catch (valErr) {
        console.warn("[SRI REINTENTO STEP 1/2] Mensaje o rechazo en Recepción SRI:", valErr.message);
        if (valErr.constructor?.name === 'SRIRejectedError' || valErr.estado === 'DEVUELTA') {
          throw valErr;
        }
      }

      console.log(`[SRI REINTENTO STEP 2/2] Consultando Autorización SRI...`);
      authResult = await authorizeXml({ claveAcceso, env: sriEnv });
      console.log(`[SRI REINTENTO STEP 2/2] ✅ Respuesta Autorización SRI:`, authResult);

      estadoFinalSri = authResult.estadoAutorizacion || authResult.estado || 'AUTORIZADO';
      rawSriResponse = authResult;
      mensajesSri = authResult.mensajes || [];

    } catch (e) {
      console.error("[SRI REINTENTO ERROR] Excepción en comunicación SOAP:", e);
      errorStack = e.stack || null;
      httpStatus = e.statusCode || e.status || e.response?.status || null;
      soapFault = e.soapFault || e.fault || null;

      if (e.constructor?.name === 'SRIRejectedError' || e.estado === 'DEVUELTA') {
        estadoFinalSri = 'DEVUELTA';
        const idMsg = e.identificador || 'SIN_ID';
        const mainMsg = e.mensaje || e.mensajeSRI || e.message || 'Comprobante devuelto por el SRI';
        const extraMsg = e.informacionAdicional || '';
        errorTecnico = `SRI DEVUELTA [${idMsg}]: ${mainMsg}${extraMsg ? ' - ' + extraMsg : ''}`;
        mensajesSri = [{ identificador: idMsg, mensaje: mainMsg, informacionAdicional: extraMsg, tipo: e.tipo || 'ERROR' }];
        rawSriResponse = { estado: 'DEVUELTA', identificador: idMsg, mensaje: mainMsg, informacionAdicional: extraMsg, tipo: e.tipo || 'ERROR', claveAcceso: e.claveAcceso || claveAcceso, errorStack, httpStatus, soapFault };
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
        sriTimeout = true;
        estadoFinalSri = 'PENDIENTE_ENVIO';
        errorTecnico = e.message || 'Sin respuesta en reintento SRI';
        rawSriResponse = { error: errorTecnico, errorName: e.name || 'Error', errorStack, httpStatus, soapFault, response: e.response || null };
      }
    }

    const safeAuthResult = rawSriResponse || authResult || { estado: estadoFinalSri };
    const safeErrorTecnico = errorTecnico || '';

    // Actualizar el documento original
    const updatePayload = sanitizeFirestorePayload({
      estadoSri: estadoFinalSri || 'PENDIENTE_ENVIO',
      numeroAutorizacion: (authResult && authResult.numeroAutorizacion) || (authResult && authResult.estadoAutorizacion === 'AUTORIZADO' ? claveAcceso : null) || (ventaData.numeroAutorizacion || null),
      fechaAutorizacion: (authResult && authResult.fechaAutorizacion && (typeof authResult.fechaAutorizacion === 'string' || authResult.fechaAutorizacion instanceof Date)) ? authResult.fechaAutorizacion.toString() : (authResult ? new Date().toISOString() : (ventaData.fechaAutorizacion || null)),
      mensajesSri: mensajesSri.length > 0 ? mensajesSri : ((authResult && authResult.mensajes) || (ventaData.mensajesSri || [])),
      xmlAutorizado: (authResult && (authResult.comprobante || authResult.xmlAutorizado)) || (ventaData.xmlAutorizado || null),
      sriRawResponse: safeAuthResult,
      errorTecnico: safeErrorTecnico || null,
      errorStack: errorStack || null,
      httpStatus: httpStatus || null,
      soapFault: soapFault || null,
      ultimoReintento: new Date().toISOString()
    });

    console.log('--- ACTUALIZANDO VENTA EN FIRESTORE ---');
    console.log(JSON.stringify(updatePayload, null, 2));

    await ventaRef.update(updatePayload);

    const logPayload = sanitizeFirestorePayload({
      timestamp: new Date().toISOString(),
      emisorId,
      cajeroUid: decodedToken.uid || 'UNKNOWN',
      ambiente: sriEnv,
      numeroComprobante: ventaData.numeroComprobante,
      secuencial: ventaData.secuencial,
      xmlFirmado: ventaData.xmlFirmado || 'NO_GENERADO',
      estadoLocal: sriTimeout ? 'TIMEOUT_REINTENTO' : 'PROCESADO',
      estadoSri: estadoFinalSri || 'PENDIENTE_ENVIO',
      respuestaSri: safeAuthResult,
      errorTecnico: safeErrorTecnico,
      errorStack: errorStack || null,
      httpStatus: httpStatus || null,
      soapFault: soapFault || null,
      esReintento: true,
      claveOriginal: claveAcceso
    });

    // Registrar el LOG del reintento
    const logRef = adminDb.collection('sri_logs').doc(`${claveAcceso}-reintento-${Date.now()}`);
    await logRef.set(logPayload);

    if (sriTimeout) {
      return res.status(200).json({ 
        success: false, 
        claveAcceso,
        estado: 'PENDIENTE_ENVIO',
        error: `Fallo de conexión SOAP en el reintento: ${safeErrorTecnico || 'Sin respuesta'}`
      });
    }

    if (estadoFinalSri === 'DEVUELTA' || estadoFinalSri === 'NO_AUTORIZADO' || estadoFinalSri === 'RECHAZADA') {
      return res.status(400).json({
        success: false,
        claveAcceso,
        estado: estadoFinalSri,
        error: safeErrorTecnico || `La factura fue ${estadoFinalSri} por el SRI en el reintento.`,
        mensajes: mensajesSri,
        sriRawResponse: safeAuthResult
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
