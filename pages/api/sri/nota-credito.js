/**
 * /api/sri/nota-credito — Endpoint para emitir una Nota de Crédito Electrónica ante el SRI.
 *
 * Flujo:
 * 1. Verificar JWT y que el usuario sea Admin (superadmin: true)
 * 2. Cargar factura original de Firestore (ventas)
 * 3. Validar: AUTORIZADA, tiene clave/autorización, no Consumidor Final, dentro de plazo, sin NC previa
 * 4. Cargar emisor y certificado .p12
 * 5. Reservar secuencial NC atómicamente
 * 6. Generar clave de acceso NC
 * 7. Generar XML NC (sriCreditNote.js)
 * 8. Firmar con signXml() de osodreamer
 * 9. Enviar a RecepcionComprobantesOffline via validateXml()
 * 10. Consultar AutorizacionComprobantesOffline via authorizeXml()
 * 11. Guardar NC en ventas, actualizar factura original, crear auditoría
 * 12. Retornar resultado real del SRI
 *
 * NUNCA marca la factura como anulada sin confirmación real del SRI.
 * Reutiliza la misma infraestructura SRI de emitir.js (certificados, endpoints, librería).
 */

import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
import { generarClaveAcceso, generarXmlNotaCredito, round2 } from '../../../src/lib/sriCreditNote';

// CRITICAL: Forzar zona horaria Ecuador
process.env.TZ = 'America/Guayaquil';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { signXml, validateXml, authorizeXml } = require('osodreamer-sri-xml-signer');
import forge from 'node-forge';
import { sanitizeFirestorePayload } from '../../../src/utils/sanitize';

// Plazo máximo para emitir NC: 12 meses
const NC_MAX_MONTHS = 12;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // ── 1. VERIFICAR JWT ──────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Falta token.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // ── 2. VERIFICAR ADMIN (superadmin: true) ──────────────────────────
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Usuario no encontrado.' });
    }

    const userData = userDoc.data();
    let isAdmin = false;

    // Verificar superadmin en customPermissions
    if (userData.customPermissions?.superadmin === true) {
      isAdmin = true;
    }
    // O en el rol asignado
    else if (userData.roleId) {
      const roleDoc = await adminDb.collection('roles').doc(userData.roleId).get();
      if (roleDoc.exists && roleDoc.data().permissions?.superadmin === true) {
        isAdmin = true;
      }
    }
    // Bypass de emergencia
    const EMERGENCY_UID = process.env.NEXT_PUBLIC_SUPER_ADMIN_UID;
    if (EMERGENCY_UID && decodedToken.uid === EMERGENCY_UID) {
      isAdmin = true;
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden emitir Notas de Crédito.' });
    }

    // ── 3. EXTRAER PARÁMETROS ─────────────────────────────────────────
    const { facturaClaveAcceso, motivo, emisorId } = req.body;

    if (!facturaClaveAcceso) {
      return res.status(400).json({ error: 'Falta la clave de acceso de la factura a revertir.' });
    }
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'El motivo de la reversión es obligatorio (mínimo 5 caracteres).' });
    }
    if (!emisorId) {
      return res.status(400).json({ error: 'Falta el ID del emisor.' });
    }

    // ── 4. CARGAR FACTURA ORIGINAL ────────────────────────────────────
    const facturaRef = adminDb.collection('ventas').doc(facturaClaveAcceso);
    const facturaDoc = await facturaRef.get();

    if (!facturaDoc.exists) {
      return res.status(404).json({ error: 'Factura no encontrada en la base de datos.' });
    }

    const facturaOriginal = facturaDoc.data();

    // ── 5. VALIDACIONES ───────────────────────────────────────────────

    // 5a. Verificar que esté AUTORIZADA
    const estadoSri = (facturaOriginal.estadoSri || '').toUpperCase();
    if (estadoSri !== 'AUTORIZADO' && estadoSri !== 'AUTORIZADA') {
      return res.status(400).json({
        error: `La factura no está autorizada por el SRI. Estado actual: ${estadoSri || 'DESCONOCIDO'}`
      });
    }

    // 5b. Verificar clave de acceso y autorización
    if (!facturaOriginal.claveAcceso) {
      return res.status(400).json({ error: 'La factura no tiene clave de acceso registrada.' });
    }
    if (!facturaOriginal.numeroAutorizacion && !facturaOriginal.fechaAutorizacion) {
      return res.status(400).json({ error: 'La factura no tiene número de autorización del SRI.' });
    }

    // 5c. Verificar que no sea Consumidor Final
    const clienteId = (facturaOriginal.cliente || facturaOriginal.customer)?.numeroIdentificacion
      || (facturaOriginal.cliente || facturaOriginal.customer)?.cedula
      || '';
    if (clienteId === '9999999999999') {
      return res.status(400).json({
        error: 'Las facturas emitidas a CONSUMIDOR FINAL no admiten Nota de Crédito según normativa SRI vigente (Resoluciones NAC-DGERCGC25-00000014 y NAC-DGERCGC25-00000017).'
      });
    }

    // 5d. Verificar plazo (12 meses)
    let fechaFactura;
    const rawDate = facturaOriginal.fechaTransaccion || facturaOriginal.fechaEmision || facturaOriginal.createdAt;
    if (rawDate && typeof rawDate.toDate === 'function') {
      fechaFactura = rawDate.toDate();
    } else if (rawDate && rawDate.seconds) {
      fechaFactura = new Date(rawDate.seconds * 1000);
    } else if (rawDate) {
      fechaFactura = new Date(rawDate);
    } else {
      return res.status(400).json({ error: 'La factura no tiene fecha de emisión registrada.' });
    }

    const ahora = new Date();
    const diffMs = ahora.getTime() - fechaFactura.getTime();
    const diffMeses = diffMs / (1000 * 60 * 60 * 24 * 30.44); // Aproximación
    if (diffMeses > NC_MAX_MONTHS) {
      return res.status(400).json({
        error: `La factura excede el plazo de ${NC_MAX_MONTHS} meses permitido por el SRI para emisión de Notas de Crédito. Fecha de emisión: ${fechaFactura.toISOString().split('T')[0]}`
      });
    }

    // 5e. Verificar que no exista NC previa
    if (facturaOriginal.notaCreditoEmitida === true) {
      return res.status(400).json({
        error: `Esta factura ya tiene una Nota de Crédito emitida. NC: ${facturaOriginal.notaCreditoClaveAcceso || 'N/A'}`
      });
    }
    if (estadoSri === 'REVERTIDA_NC' || estadoSri === 'NC_EN_PROCESO') {
      return res.status(400).json({
        error: `Esta factura ya tiene un proceso de Nota de Crédito en curso o completado. Estado: ${estadoSri}`
      });
    }

    // 5f. Verificar que la factura corresponda al emisor
    if (facturaOriginal.emisorId && facturaOriginal.emisorId !== emisorId) {
      return res.status(400).json({
        error: 'El emisor proporcionado no corresponde al emisor de la factura.'
      });
    }

    // ── 6. CARGAR EMISOR ──────────────────────────────────────────────
    const emisorDoc = await adminDb.collection('issuers').doc(emisorId).get();
    if (!emisorDoc.exists) {
      return res.status(404).json({ error: 'Emisor no encontrado en la base de datos.' });
    }
    const emisor = emisorDoc.data();

    // ── 7. CARGAR CERTIFICADO .p12 ────────────────────────────────────
    const secretDoc = await adminDb.collection('issuers_secrets').doc(emisorId).get();
    if (!secretDoc.exists) {
      return res.status(400).json({
        error: `Falta la firma electrónica (.p12) para el emisor ${emisor.razonSocial || emisor.name}. Suba el certificado en Ajustes.`
      });
    }
    const secretData = secretDoc.data();
    const p12Buffer = Buffer.from(secretData.p12Base64, 'base64');
    const p12Password = secretData.password;

    if (!p12Buffer || !p12Password) {
      return res.status(500).json({ error: 'La firma electrónica o contraseña están corruptas.' });
    }

    // Validar que el .p12 corresponda al RUC del emisor
    try {
      const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);

      let certRucOrCedula = null;
      for (const safeContents of p12.safeContents) {
        for (const bag of safeContents.safeBags) {
          if (bag.cert) {
            const subject = bag.cert.subject.attributes || [];
            for (const attr of subject) {
              const val = String(attr.value || '').trim();
              if (attr.name === 'serialNumber' || attr.type === '2.5.4.5') {
                const match = val.match(/^(\d{10})/);
                if (match) certRucOrCedula = match[1];
              } else if (val.length === 13 && /^\d+$/.test(val)) {
                certRucOrCedula = val.slice(0, 10);
              }
            }
          }
        }
      }

      if (certRucOrCedula && emisor.ruc && !emisor.ruc.startsWith(certRucOrCedula)) {
        return res.status(400).json({
          error: `El certificado .p12 (Cédula/RUC ${certRucOrCedula}) NO corresponde al RUC del emisor (${emisor.ruc}).`
        });
      }
    } catch (certErr) {
      console.warn('Advertencia al validar certificado P12 para NC:', certErr.message);
    }

    // ── 8. RESERVAR SECUENCIAL NC ATÓMICAMENTE ────────────────────────
    const estab = facturaOriginal.establecimiento || emisor.estab || emisor.establecimiento || '001';
    const ptoEmi = facturaOriginal.puntoEmision || emisor.ptoEmi || emisor.puntoEmision || '001';
    const secKeyNC = `${estab}_${ptoEmi}_NC`;

    let secuencialNC = 1;
    const issuerRef = adminDb.collection('issuers').doc(emisorId);

    try {
      await adminDb.runTransaction(async (t) => {
        const docSnap = await t.get(issuerRef);
        if (!docSnap.exists) throw new Error('Emisor no encontrado');

        const data = docSnap.data();
        const secuenciales = data.secuenciales || {};

        secuencialNC = secuenciales[secKeyNC] || 1;
        t.update(issuerRef, { [`secuenciales.${secKeyNC}`]: secuencialNC + 1 });
      });

      console.log(`🔒 [NC SECUENCIAL] Reservado: ${secuencialNC}, Siguiente: ${secuencialNC + 1}`);
    } catch (seqErr) {
      console.error('Error reservando secuencial NC:', seqErr);
      return res.status(500).json({ error: 'Error de concurrencia al reservar secuencial de NC: ' + seqErr.message });
    }

    const secStr = String(secuencialNC).padStart(9, '0');
    const numeroNC = `${estab}-${ptoEmi}-${secStr}`;

    // ── 9. GENERAR CLAVE DE ACCESO NC ─────────────────────────────────
    const ambienteEmisor = (emisor.ambiente === '2' || process.env.SRI_ENVIRONMENT === 'production') ? 2 : 1;

    const claveAccesoNC = generarClaveAcceso({
      fechaEmision: new Date(),
      tipoComprobante: '04', // Nota de Crédito
      ruc: emisor.ruc,
      ambiente: ambienteEmisor,
      estab,
      ptoEmi,
      secuencial: secStr
    });

    console.log(`[NC] Clave de Acceso generada: ${claveAccesoNC}`);
    console.log(`[NC] Número NC: ${numeroNC}`);
    console.log(`[NC] Factura original: ${facturaOriginal.numeroComprobante}`);

    // ── 10. GENERAR XML DE NOTA DE CRÉDITO ────────────────────────────
    let xmlNC;
    try {
      xmlNC = generarXmlNotaCredito({
        emisor,
        facturaOriginal,
        motivo: motivo.trim(),
        ambiente: ambienteEmisor,
        estab,
        ptoEmi,
        secuencial: secStr,
        claveAcceso: claveAccesoNC
      });
      console.log(`[NC] XML generado correctamente (${xmlNC.length} bytes)`);
    } catch (xmlErr) {
      console.error('[NC] Error generando XML:', xmlErr);
      return res.status(500).json({
        error: 'Error al generar el XML de la Nota de Crédito: ' + xmlErr.message
      });
    }

    // ── 11. FIRMAR XML ────────────────────────────────────────────────
    let signedXml;
    try {
      signedXml = await signXml({
        p12Buffer: p12Buffer,
        password: p12Password,
        xmlBuffer: Buffer.from(xmlNC, 'utf8')
      });
      console.log(`[NC] XML firmado correctamente (${signedXml.length} bytes)`);
    } catch (signErr) {
      console.error('[NC] Error firmando XML:', signErr);

      // Guardar el error en Firestore para diagnóstico
      await guardarResultadoNC(adminDb, {
        claveAccesoNC,
        numeroNC,
        facturaOriginal,
        facturaClaveAcceso,
        emisorId,
        motivo,
        decodedToken,
        estadoSriNC: 'ERROR_FIRMA',
        xmlNC,
        signedXml: null,
        authResult: null,
        errorTecnico: 'Error de firma: ' + signErr.message
      });

      return res.status(500).json({
        error: 'Error al firmar el XML de la Nota de Crédito: ' + signErr.message
      });
    }

    // ── 12. ENVIAR AL SRI Y AUTORIZAR ─────────────────────────────────
    const sriEnvConfig = (process.env.SRI_ENVIRONMENT || '').trim().toLowerCase();
    const isProdEnv = sriEnvConfig === 'production';
    const sriEnv = isProdEnv ? 'prod' : 'test';

    console.log(`[NC SRI] Ambiente: ${isProdEnv ? 'PRODUCCIÓN' : 'PRUEBAS'}`);
    console.log(`[NC SRI] URL Recepción: https://${isProdEnv ? 'cel' : 'celcer'}.sri.gob.ec/...`);

    let authResult = null;
    let estadoSriNC = 'NC_EN_PROCESO';
    let errorTecnico = null;
    let mensajesSri = [];
    let rawSriResponse = null;

    try {
      // 12a. Enviar a Recepción
      console.log('[NC SRI STEP 1/2] Enviando XML a Recepción SOAP...');
      const validateRes = await validateXml({
        env: sriEnv,
        xml: Buffer.from(signedXml, 'utf8')
      });
      console.log('[NC SRI STEP 1/2] ✅ XML recibido por el SRI:', validateRes);

      // 12b. Consultar Autorización
      console.log('[NC SRI STEP 2/2] Consultando Autorización SOAP...');
      authResult = await authorizeXml({
        claveAcceso: claveAccesoNC,
        env: sriEnv
      });
      console.log('[NC SRI STEP 2/2] ✅ Respuesta Autorización:', authResult);

      const estadoAuth = (authResult.estadoAutorizacion || authResult.estado || '').toUpperCase();
      
      if (estadoAuth === 'AUTORIZADO' || estadoAuth === 'AUTORIZADA') {
        estadoSriNC = 'AUTORIZADO';
        mensajesSri = authResult.mensajes || [];
        rawSriResponse = authResult;
      } else {
        estadoSriNC = 'NC_RECHAZADA';
        errorTecnico = `SRI rechazó la NC: ${estadoAuth}`;
        mensajesSri = authResult.mensajes || [];
        rawSriResponse = authResult;
      }
    } catch (sriErr) {
      console.error('[NC SRI] Error en comunicación con SRI:', sriErr);

      // Manejar CLAVE ACCESO REGISTRADA
      const isClaveRegistrada = (sriErr.identificador === '43') ||
        (sriErr.message && sriErr.message.includes('CLAVE ACCESO REGISTRADA'));

      if (isClaveRegistrada) {
        console.log('[NC SRI] ⚠️ CLAVE ACCESO REGISTRADA (43). Re-consultando autorización...');
        try {
          const checkAuth = await authorizeXml({ claveAcceso: claveAccesoNC, env: sriEnv });
          const estCheck = (checkAuth.estadoAutorizacion || checkAuth.estado || '').toUpperCase();
          if (estCheck === 'AUTORIZADO' || estCheck === 'AUTORIZADA') {
            authResult = checkAuth;
            estadoSriNC = 'AUTORIZADO';
            rawSriResponse = authResult;
            mensajesSri = authResult.mensajes || [];
          }
        } catch (secErr) {
          console.warn('[NC SRI] Consulta post-error-43 falló:', secErr.message);
        }
      }

      if (estadoSriNC !== 'AUTORIZADO') {
        if (sriErr.estado === 'DEVUELTA' || sriErr.constructor?.name === 'SRIRejectedError') {
          estadoSriNC = 'NC_RECHAZADA';
          errorTecnico = `SRI DEVOLVIÓ la NC: ${sriErr.mensaje || sriErr.message}`;
          mensajesSri = sriErr.mensajes || [{ identificador: sriErr.identificador, mensaje: sriErr.mensaje || sriErr.message }];
          rawSriResponse = { estado: 'DEVUELTA', error: errorTecnico };
        } else if (sriErr.estado === 'NO AUTORIZADO' || sriErr.constructor?.name === 'SRIAutorizacionError') {
          estadoSriNC = 'NC_RECHAZADA';
          errorTecnico = `SRI NO AUTORIZÓ la NC: ${sriErr.mensaje || sriErr.message}`;
          mensajesSri = sriErr.mensajes || [{ identificador: sriErr.identificador, mensaje: sriErr.mensaje || sriErr.message }];
          rawSriResponse = { estado: sriErr.estado, error: errorTecnico };
        } else {
          // Error de red/timeout — NC queda en proceso
          estadoSriNC = 'NC_EN_PROCESO';
          errorTecnico = 'No fue posible comunicarse con el SRI: ' + sriErr.message;
          rawSriResponse = { error: errorTecnico };
        }
      }
    }

    // ── 13. GUARDAR EN FIRESTORE ──────────────────────────────────────
    const resultado = await guardarResultadoNC(adminDb, {
      claveAccesoNC,
      numeroNC,
      facturaOriginal,
      facturaClaveAcceso,
      emisorId,
      motivo,
      decodedToken,
      estadoSriNC,
      xmlNC,
      signedXml,
      authResult,
      errorTecnico,
      mensajesSri,
      rawSriResponse,
      estab,
      ptoEmi,
      secStr,
      ambienteEmisor
    });

    // ── 14. RESPUESTA AL FRONTEND ─────────────────────────────────────
    const isSuccess = estadoSriNC === 'AUTORIZADO';

    return res.status(isSuccess ? 200 : (estadoSriNC === 'NC_EN_PROCESO' ? 202 : 400)).json({
      success: isSuccess,
      notaCredito: {
        claveAcceso: claveAccesoNC,
        numero: numeroNC,
        estado: estadoSriNC,
        numeroAutorizacion: authResult?.numeroAutorizacion || authResult?.claveAcceso || null,
        fechaAutorizacion: authResult?.fechaAutorizacion || null
      },
      facturaOriginal: {
        claveAcceso: facturaClaveAcceso,
        numero: facturaOriginal.numeroComprobante,
        estadoActualizado: isSuccess ? 'REVERTIDA_NC' : estadoSri
      },
      motivo,
      error: errorTecnico || null,
      mensajesSri: mensajesSri
    });

  } catch (error) {
    console.error('[NC] Error general:', error);
    return res.status(500).json({
      error: 'Error interno procesando Nota de Crédito: ' + error.message
    });
  }
}

/**
 * Guarda el resultado de la emisión de NC en Firestore.
 * - Crea el documento de la NC en `ventas`
 * - Actualiza la factura original con la referencia a la NC
 * - Crea el registro de auditoría en `sri_anulaciones`
 * - Crea el log en `sri_logs`
 */
async function guardarResultadoNC(adminDb, params) {
  const {
    claveAccesoNC, numeroNC, facturaOriginal, facturaClaveAcceso,
    emisorId, motivo, decodedToken, estadoSriNC,
    xmlNC, signedXml, authResult, errorTecnico,
    mensajesSri = [], rawSriResponse = null,
    estab, ptoEmi, secStr, ambienteEmisor
  } = params;

  const batch = adminDb.batch();
  const ahora = new Date();
  const isAutorizada = estadoSriNC === 'AUTORIZADO';
  const cliente = facturaOriginal.cliente || facturaOriginal.customer || {};

  // 1. Guardar documento de la NC en ventas
  const ncData = sanitizeFirestorePayload({
    // Tipo de documento
    tipoComprobante: 'NOTA_CREDITO',
    isNotaCredito: true,
    codDoc: '04',

    // Referencia a factura original
    facturaOriginalClaveAcceso: facturaClaveAcceso,
    facturaOriginalNumero: facturaOriginal.numeroComprobante,
    codDocModificado: '01',
    numDocModificado: facturaOriginal.numeroComprobante,

    // Datos de la NC
    claveAcceso: claveAccesoNC,
    numeroComprobante: numeroNC,
    secuencial: secStr,
    establecimiento: estab,
    puntoEmision: ptoEmi,

    // Cliente (mismos datos de la factura original)
    cliente: cliente,

    // Totales (reversa total de la factura)
    subtotalSinImpuestos: round2(facturaOriginal.totals?.subtotal || facturaOriginal.subtotal || 0),
    valorIva: round2(facturaOriginal.totals?.ivaAmount || facturaOriginal.ivaAmount || 0),
    importeTotal: round2(facturaOriginal.totals?.total || facturaOriginal.total || 0),
    totals: facturaOriginal.totals || {
      subtotal: facturaOriginal.subtotal || 0,
      ivaAmount: facturaOriginal.ivaAmount || 0,
      total: facturaOriginal.total || 0
    },

    // Productos (mismos que la factura)
    productos: facturaOriginal.productos || facturaOriginal.items || [],

    // Estado
    estadoVenta: 'NOTA_CREDITO',
    estadoSri: estadoSriNC,
    
    // Autorización SRI
    numeroAutorizacion: isAutorizada
      ? (authResult?.numeroAutorizacion || authResult?.claveAcceso || claveAccesoNC)
      : null,
    fechaAutorizacion: isAutorizada
      ? (authResult?.fechaAutorizacion || ahora.toISOString())
      : null,
    mensajesSri: mensajesSri,

    // XML
    xmlGenerado: xmlNC || null,
    xmlFirmado: signedXml || null,
    xmlAutorizado: isAutorizada ? (authResult?.comprobante || authResult?.xmlAutorizado || signedXml) : null,

    // Metadata
    emisorId,
    ambiente: String(ambienteEmisor || 2),
    motivo,
    cajeroUid: decodedToken.uid,
    fechaTransaccion: ahora.toISOString(),
    createdAt: ahora.toISOString(),
    errorTecnico: errorTecnico || null,
    respuestaSri: rawSriResponse || null,
    isNotaVenta: false
  });

  const ncRef = adminDb.collection('ventas').doc(claveAccesoNC);
  batch.set(ncRef, ncData);

  // 2. Actualizar factura original
  const facturaUpdate = {
    notaCreditoEmitida: true,
    notaCreditoClaveAcceso: claveAccesoNC,
    notaCreditoNumero: numeroNC,
    notaCreditoEstado: estadoSriNC,
    notaCreditoFecha: ahora.toISOString(),
    notaCreditoMotivo: motivo,
    notaCreditoUsuario: decodedToken.uid
  };

  // Solo cambiar estado de la factura si la NC fue AUTORIZADA
  if (isAutorizada) {
    facturaUpdate.estadoSri = 'REVERTIDA_NC';
    facturaUpdate.notaCreditoNumeroAutorizacion = authResult?.numeroAutorizacion || claveAccesoNC;
    facturaUpdate.notaCreditoFechaAutorizacion = authResult?.fechaAutorizacion || ahora.toISOString();
  } else if (estadoSriNC === 'NC_EN_PROCESO') {
    facturaUpdate.estadoSri = 'NC_EN_PROCESO';
  }
  // Si NC_RECHAZADA, NO cambiar el estado de la factura (se queda AUTORIZADA)

  const facturaRef = adminDb.collection('ventas').doc(facturaClaveAcceso);
  batch.update(facturaRef, sanitizeFirestorePayload(facturaUpdate));

  // 3. Registro de auditoría
  const auditData = sanitizeFirestorePayload({
    // Factura
    facturaClaveAcceso,
    facturaNumero: facturaOriginal.numeroComprobante,
    facturaFechaEmision: facturaOriginal.fechaTransaccion || facturaOriginal.fechaEmision || facturaOriginal.createdAt,
    facturaNumeroAutorizacion: facturaOriginal.numeroAutorizacion || null,

    // Cliente
    clienteNombre: cliente.nombre || 'N/A',
    clienteIdentificacion: cliente.numeroIdentificacion || 'N/A',

    // Totales
    totalFactura: round2(facturaOriginal.totals?.total || facturaOriginal.total || 0),

    // Nota de Crédito
    notaCreditoClaveAcceso: claveAccesoNC,
    notaCreditoNumero: numeroNC,
    notaCreditoEstadoSri: estadoSriNC,
    notaCreditoNumeroAutorizacion: isAutorizada
      ? (authResult?.numeroAutorizacion || claveAccesoNC)
      : null,

    // Solicitud
    motivo,
    usuarioUid: decodedToken.uid,
    accion: 'EMISION_NOTA_CREDITO',

    // Estado
    estadoAnterior: 'AUTORIZADA',
    estadoFinal: isAutorizada ? 'REVERTIDA_NC' : (estadoSriNC === 'NC_EN_PROCESO' ? 'NC_EN_PROCESO' : 'AUTORIZADA'),

    // Respuesta SRI
    respuestaSri: rawSriResponse || null,
    mensajesSri: mensajesSri,
    errorTecnico: errorTecnico || null,

    // Fechas
    fechaSolicitud: ahora.toISOString(),
    fechaRespuestaSri: ahora.toISOString(),
    createdAt: ahora.toISOString()
  });

  const auditRef = adminDb.collection('sri_anulaciones').doc();
  batch.set(auditRef, auditData);

  // 4. Log en sri_logs
  const logData = sanitizeFirestorePayload({
    timestamp: ahora.toISOString(),
    tipoOperacion: 'NOTA_CREDITO',
    emisorId,
    cajeroUid: decodedToken.uid,
    claveAcceso: claveAccesoNC,
    numeroComprobante: numeroNC,
    codDoc: '04',
    facturaOriginal: facturaClaveAcceso,
    estadoSri: estadoSriNC,
    xmlFirmado: signedXml || xmlNC || 'NO_GENERADO',
    respuestaSri: rawSriResponse || {},
    errorTecnico: errorTecnico || '',
    mensajesSri: mensajesSri
  });

  const logRef = adminDb.collection('sri_logs').doc(claveAccesoNC);
  batch.set(logRef, logData);

  await batch.commit();
  console.log(`[NC] Firestore actualizado. NC: ${claveAccesoNC}, Estado: ${estadoSriNC}`);

  return { claveAccesoNC, estadoSriNC };
}
