import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
import { sendInvoiceEmail } from '../../../src/lib/mailer';
import { generateRidePdf } from '../../../src/lib/pdfGenerator';
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
    let codigoRespuesta = null;
    let mensajeRespuesta = null;
    let informacionAdicional = null;
    let estadoRespuestaSRI = 'PENDIENTE_ENVIO';

    console.log(`[SRI REINTENTO] Clave: ${claveAcceso} | Modo: ${isProdEnv ? 'PRODUCCIÓN' : 'PRUEBAS'} (${sriEnv})`);

    // PASO 1: Consultar PRIMERO el Web Service de Autorización del SRI por Clave de Acceso
    let yaAutorizado = false;
    try {
      console.log(`[SRI REINTENTO STEP 0] Consultando previa Autorización en SRI para clave: ${claveAcceso}...`);
      const checkAuth = await authorizeXml({ claveAcceso, env: sriEnv });
      console.log(`[SRI REINTENTO STEP 0 RESULT]:`, checkAuth);

      const estCheck = (checkAuth && (checkAuth.estadoAutorizacion || checkAuth.estado || '')).toUpperCase();
      if (estCheck === 'AUTORIZADO') {
        yaAutorizado = true;
        authResult = checkAuth;
        estadoFinalSri = 'AUTORIZADO';
        estadoRespuestaSRI = 'AUTORIZADO';
        mensajeRespuesta = 'Comprobante AUTORIZADO correctamente por el SRI';
        rawSriResponse = authResult;
        mensajesSri = authResult.mensajes || [];
        console.log(`[SRI REINTENTO] ✅ La clave ${claveAcceso} YA ESTABA AUTORIZADA en el SRI. Omitiendo retransmisión SOAP a Recepción.`);
      }
    } catch (checkErr) {
      console.log(`[SRI REINTENTO STEP 0] Clave ${claveAcceso} no figuraba como autorizada previa: ${checkErr.message}`);
    }

    // PASO 2: Si NO estaba autorizada previamente, intentar flujo de Recepción (validateXml) y Autorización
    if (!yaAutorizado) {
      try {
        console.log(`[SRI REINTENTO STEP 1/2] Enviando XML a Recepción SOAP...`);
        const validateRes = await validateXml({ env: sriEnv, xml: Buffer.from(ventaData.xmlFirmado, 'utf8') });
        console.log(`[SRI REINTENTO STEP 1/2] ✅ XML recibido en Recepción SRI:`, validateRes);
        await new Promise(r => setTimeout(r, 1500));

        console.log(`[SRI REINTENTO STEP 2/2] Consultando Autorización SRI...`);
        authResult = await authorizeXml({ claveAcceso, env: sriEnv });
        console.log(`[SRI REINTENTO STEP 2/2] ✅ Respuesta Autorización SRI:`, authResult);

        estadoFinalSri = authResult.estadoAutorizacion || authResult.estado || 'AUTORIZADO';
        estadoRespuestaSRI = estadoFinalSri;
        mensajeRespuesta = 'Comprobante AUTORIZADO correctamente por el SRI';
        rawSriResponse = authResult;
        mensajesSri = authResult.mensajes || [];

      } catch (e) {
        console.error("[SRI REINTENTO ERROR] Excepción en comunicación SOAP:", e);
        errorStack = e.stack || null;
        httpStatus = e.statusCode || e.status || e.response?.status || 500;
        soapFault = e.soapFault || e.fault || null;

        // Manejo especial de "DEVUELTA [43] - CLAVE ACCESO REGISTRADA"
        const isClaveRegistrada = (e.identificador === '43') || 
                                  (e.message && e.message.includes('CLAVE ACCESO REGISTRADA')) || 
                                  (e.mensaje && e.mensaje.includes('CLAVE ACCESO REGISTRADA'));

        if (isClaveRegistrada) {
          console.log(`[SRI REINTENTO] ⚠️ SRI Recepción devolvió CLAVE ACCESO REGISTRADA (43). Re-consultando servicio de Autorización...`);
          try {
            const secondCheck = await authorizeXml({ claveAcceso, env: sriEnv });
            const estSecond = (secondCheck && (secondCheck.estadoAutorizacion || secondCheck.estado || '')).toUpperCase();
            if (estSecond === 'AUTORIZADO') {
              authResult = secondCheck;
              estadoFinalSri = 'AUTORIZADO';
              estadoRespuestaSRI = 'AUTORIZADO';
              mensajeRespuesta = 'Comprobante AUTORIZADO correctamente por el SRI';
              rawSriResponse = authResult;
              mensajesSri = authResult.mensajes || [];
              sriTimeout = false;
              // Salir del catch exitosamente
              e = null;
            }
          } catch (secErr) {
            console.warn("[SRI REINTENTO] Re-consulta de autorización tras error 43 también falló:", secErr.message);
          }
        }

        if (e) {
          if (e.constructor?.name === 'SRIRejectedError' || e.estado === 'DEVUELTA') {
            estadoFinalSri = 'DEVUELTA';
            estadoRespuestaSRI = 'DEVUELTA';
            codigoRespuesta = e.identificador || (e.mensajes?.[0]?.identificador) || 'SIN_ID';
            mensajeRespuesta = e.mensaje || e.mensajeSRI || (e.mensajes?.[0]?.mensaje) || e.message || 'Comprobante devuelto por el SRI';
            informacionAdicional = e.informacionAdicional || (e.mensajes?.[0]?.informacionAdicional) || null;
            errorTecnico = `SRI DEVUELTA [${codigoRespuesta}]: ${mensajeRespuesta}${informacionAdicional ? ' - ' + informacionAdicional : ''}`;
            mensajesSri = [{ identificador: codigoRespuesta, mensaje: mensajeRespuesta, informacionAdicional: informacionAdicional || '', tipo: e.tipo || 'ERROR' }];
            rawSriResponse = { estado: 'DEVUELTA', identificador: codigoRespuesta, mensaje: mensajeRespuesta, informacionAdicional, tipo: e.tipo || 'ERROR', claveAcceso: e.claveAcceso || claveAcceso, errorStack, httpStatus, soapFault };
            sriTimeout = false;

          } else if (e.constructor?.name === 'SRIAutorizacionError' || e.estado === 'NO AUTORIZADO' || e.estado === 'RECHAZADA') {
            estadoFinalSri = e.estado || 'NO_AUTORIZADO';
            estadoRespuestaSRI = estadoFinalSri;
            codigoRespuesta = e.identificador || (e.mensajes?.[0]?.identificador) || 'SIN_ID';
            mensajeRespuesta = e.mensaje || e.mensajeSRI || (e.mensajes?.[0]?.mensaje) || e.message || 'Comprobante no autorizado por el SRI';
            informacionAdicional = e.informacionAdicional || (e.mensajes?.[0]?.informacionAdicional) || null;
            errorTecnico = `SRI ${estadoFinalSri} [${codigoRespuesta}]: ${mensajeRespuesta}${informacionAdicional ? ' - ' + informacionAdicional : ''}`;
            mensajesSri = [{ identificador: codigoRespuesta, mensaje: mensajeRespuesta, informacionAdicional: informacionAdicional || '', tipo: e.tipo || 'ERROR' }];
            rawSriResponse = { estado: estadoFinalSri, identificador: codigoRespuesta, mensaje: mensajeRespuesta, informacionAdicional, tipo: e.tipo || 'ERROR', comprobanteXml: e.comprobanteXml || null, errorStack, httpStatus, soapFault };
            sriTimeout = false;

          } else if (e.constructor?.name === 'SRIUnauthorizedError') {
            estadoFinalSri = e.estado || 'NO_AUTORIZADO';
            estadoRespuestaSRI = estadoFinalSri;
            mensajeRespuesta = `SRI Autorización incompleta: estado ${estadoFinalSri}`;
            errorTecnico = mensajeRespuesta;
            rawSriResponse = { estado: estadoFinalSri, error: errorTecnico, errorStack, httpStatus, soapFault };
            sriTimeout = false;

          } else {
            sriTimeout = true;
            estadoFinalSri = 'PENDIENTE_ENVIO';
            estadoRespuestaSRI = 'PENDIENTE_ENVIO';
            mensajeRespuesta = 'No fue posible comunicarse con el SRI.';
            informacionAdicional = e.message || 'Sin respuesta del servidor SRI en reintento';
            errorTecnico = 'No fue posible comunicarse con el SRI.';
            rawSriResponse = { error: errorTecnico, errorName: e.name || 'Error', errorStack, httpStatus, soapFault, response: e.response || null };
          }
        }
      }
    }

    const safeAuthResult = rawSriResponse || authResult || { estado: estadoFinalSri };
    const safeErrorTecnico = errorTecnico || '';

    // Actualizar el documento original
    const updatePayload = sanitizeFirestorePayload({
      estadoSri: estadoFinalSri || 'PENDIENTE_ENVIO',
      estadoRespuestaSRI: estadoRespuestaSRI || estadoFinalSri || 'PENDIENTE_ENVIO',
      codigoRespuesta: codigoRespuesta || null,
      mensajeRespuesta: mensajeRespuesta || null,
      informacionAdicional: informacionAdicional || null,
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
      estadoRespuestaSRI: estadoRespuestaSRI || estadoFinalSri || 'PENDIENTE_ENVIO',
      codigoRespuesta: codigoRespuesta || null,
      mensajeRespuesta: mensajeRespuesta || null,
      informacionAdicional: informacionAdicional || null,
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

    // Envío automático de Email al cliente (Solo si la factura quedó AUTORIZADA)
    if (estadoFinalSri === 'AUTORIZADO') {
      const clienteData = ventaData.cliente || ventaData.customer || {};
      const customerEmail = clienteData.correo || clienteData.email;
      if (customerEmail && customerEmail !== 'N/A' && customerEmail.trim() !== '' && !customerEmail.toLowerCase().includes('consumidorfinal')) {
        console.log(`📧 [SRI REINTENTO] Factura AUTORIZADA. Enviando correo a ${customerEmail}...`);
        try {
          const pdfBuffer = await generateRidePdf({
            issuerData,
            customer: clienteData,
            cart: (ventaData.productos || ventaData.items || []).map(p => ({
              id: p.id || p.codigo,
              sku: p.codigoBarras || p.sku || p.codigo || '',
              name: p.name || p.nombre,
              qty: p.qty || p.cantidad || 1,
              price: p.precioUnitario !== undefined ? p.precioUnitario : (p.price || p.precio || 0),
              precioTotalSinImpuesto: p.precioTotalSinImpuesto || ((p.price || p.precio || 0) * (p.qty || p.cantidad || 1))
            })),
            totalsData: ventaData.totals || { subtotal: ventaData.subtotal || 0, ivaAmount: ventaData.ivaAmount || 0, total: ventaData.total || 0 },
            claveAcceso,
            numeroComprobante: ventaData.numeroComprobante,
            fecha: new Date(ventaData.fechaTransaccion || Date.now())
          });

          const xmlContent = (authResult && (authResult.comprobante || authResult.xmlAutorizado)) || ventaData.xmlAutorizado || ventaData.xmlFirmado || '';

          const mailRes = await sendInvoiceEmail({
            customerEmail,
            pdfBuffer,
            xmlBuffer: xmlContent,
            claveAcceso,
            issuerName: issuerData.name || issuerData.razonSocial || 'GRAVITY DENIM',
            numeroComprobante: ventaData.numeroComprobante
          });

          const estadoEmail = mailRes.success ? 'ENVIADO' : 'ERROR_ENVIO';
          await ventaRef.update({
            estadoEmail,
            emailStatus: estadoEmail,
            emailResult: mailRes,
            emailError: mailRes.success ? null : (mailRes.error || 'Fallo de envío SMTP'),
            ultimoEnvioEmail: new Date().toISOString()
          });
        } catch (emailErr) {
          console.error("❌ [SRI REINTENTO] Excepción al enviar correo electrónico:", emailErr);
          await ventaRef.update({
            estadoEmail: 'ERROR_ENVIO',
            emailStatus: 'ERROR_ENVIO',
            emailError: emailErr.message,
            ultimoEnvioEmail: new Date().toISOString()
          });
        }
      } else {
        console.log("ℹ️ [SRI REINTENTO] Cliente sin correo válido. Omitiendo envío de email.");
        await ventaRef.update({
          estadoEmail: 'SIN_CORREO_VALIDO',
          emailStatus: 'SIN_CORREO_VALIDO'
        });
      }
    }

    if (sriTimeout) {
      return res.status(200).json({ 
        success: false, 
        claveAcceso,
        estado: 'PENDIENTE_ENVIO',
        estadoRespuestaSRI: 'PENDIENTE_ENVIO',
        codigoRespuesta: null,
        mensajeRespuesta: 'No fue posible comunicarse con el SRI.',
        informacionAdicional: safeErrorTecnico || null,
        error: 'No fue posible comunicarse con el SRI.',
        soapFault,
        httpStatus: httpStatus || 504
      });
    }

    if (estadoFinalSri === 'DEVUELTA' || estadoFinalSri === 'NO_AUTORIZADO' || estadoFinalSri === 'RECHAZADA') {
      return res.status(400).json({
        success: false,
        claveAcceso,
        estado: estadoFinalSri,
        estadoRespuestaSRI: estadoRespuestaSRI || estadoFinalSri,
        codigoRespuesta,
        mensajeRespuesta,
        informacionAdicional,
        error: safeErrorTecnico || mensajeRespuesta || `La factura fue ${estadoFinalSri} por el SRI en el reintento.`,
        mensajes: mensajesSri,
        soapFault,
        httpStatus: httpStatus || 400,
        sriRawResponse: safeAuthResult
      });
    }

    return res.status(200).json({ 
      success: true, 
      claveAcceso, 
      estado: estadoFinalSri,
      estadoRespuestaSRI: estadoFinalSri,
      codigoRespuesta: null,
      mensajeRespuesta: 'Comprobante AUTORIZADO correctamente por el SRI',
      informacionAdicional: null,
      mensajes: (authResult && authResult.mensajes) ? authResult.mensajes : []
    });

  } catch (error) {
    console.error('Error in /api/sri/reintentar:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor en reintento' });
  }
}
