/**
 * /api/sri/consultar-anulacion — Consulta el estado de una Nota de Crédito ante el SRI.
 *
 * Para NC que quedaron en estado NC_EN_PROCESO (por timeout o falta de respuesta),
 * este endpoint permite consultar el estado real ante el SRI y actualizar Firestore.
 *
 * Solo accesible por Admin (superadmin: true).
 */

import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';

process.env.TZ = 'America/Guayaquil';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { authorizeXml } = require('osodreamer-sri-xml-signer');
import { sanitizeFirestorePayload } from '../../../src/utils/sanitize';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // 1. Verificar JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 2. Verificar Admin
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Usuario no encontrado.' });
    }

    const userData = userDoc.data();
    let isAdmin = false;
    if (userData.customPermissions?.superadmin === true) {
      isAdmin = true;
    } else if (userData.roleId) {
      const roleDoc = await adminDb.collection('roles').doc(userData.roleId).get();
      if (roleDoc.exists && roleDoc.data().permissions?.superadmin === true) {
        isAdmin = true;
      }
    }
    const EMERGENCY_UID = process.env.NEXT_PUBLIC_SUPER_ADMIN_UID;
    if (EMERGENCY_UID && decodedToken.uid === EMERGENCY_UID) isAdmin = true;

    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden consultar el estado de Notas de Crédito.' });
    }

    // 3. Extraer parámetros
    const { claveAccesoNC } = req.body;
    if (!claveAccesoNC) {
      return res.status(400).json({ error: 'Falta la clave de acceso de la Nota de Crédito.' });
    }

    // 4. Buscar la NC en Firestore
    const ncRef = adminDb.collection('ventas').doc(claveAccesoNC);
    const ncDoc = await ncRef.get();

    if (!ncDoc.exists) {
      return res.status(404).json({ error: 'Nota de Crédito no encontrada en la base de datos.' });
    }

    const ncData = ncDoc.data();

    // Verificar que sea una NC
    if (ncData.tipoComprobante !== 'NOTA_CREDITO' && ncData.codDoc !== '04') {
      return res.status(400).json({ error: 'El documento no es una Nota de Crédito.' });
    }

    // Si ya está autorizada, solo devolver el estado
    if (ncData.estadoSri === 'AUTORIZADO') {
      return res.status(200).json({
        success: true,
        estado: 'AUTORIZADO',
        mensaje: 'La Nota de Crédito ya está AUTORIZADA por el SRI.',
        notaCredito: {
          claveAcceso: claveAccesoNC,
          numero: ncData.numeroComprobante,
          estado: 'AUTORIZADO',
          numeroAutorizacion: ncData.numeroAutorizacion,
          fechaAutorizacion: ncData.fechaAutorizacion
        }
      });
    }

    // 5. Consultar al SRI
    const sriEnvConfig = (process.env.SRI_ENVIRONMENT || '').trim().toLowerCase();
    const isProdEnv = sriEnvConfig === 'production';
    const sriEnv = isProdEnv ? 'prod' : 'test';

    console.log(`[NC CONSULTA] Consultando estado de NC ${claveAccesoNC} en SRI (${sriEnv})...`);

    let authResult = null;
    let nuevoEstado = ncData.estadoSri;
    let errorTecnico = null;

    try {
      authResult = await authorizeXml({
        claveAcceso: claveAccesoNC,
        env: sriEnv
      });

      const estadoAuth = (authResult.estadoAutorizacion || authResult.estado || '').toUpperCase();
      console.log(`[NC CONSULTA] Respuesta SRI: ${estadoAuth}`);

      if (estadoAuth === 'AUTORIZADO' || estadoAuth === 'AUTORIZADA') {
        nuevoEstado = 'AUTORIZADO';
      } else if (estadoAuth === 'NO AUTORIZADO' || estadoAuth === 'RECHAZADA') {
        nuevoEstado = 'NC_RECHAZADA';
        errorTecnico = `SRI: ${estadoAuth}`;
      } else {
        // Estado desconocido o aún en proceso
        nuevoEstado = 'NC_EN_PROCESO';
      }
    } catch (sriErr) {
      console.error('[NC CONSULTA] Error consultando SRI:', sriErr);
      errorTecnico = 'Error consultando SRI: ' + sriErr.message;
      // Mantener estado actual
    }

    // 6. Actualizar Firestore si cambió el estado
    if (nuevoEstado !== ncData.estadoSri) {
      const batch = adminDb.batch();
      const ahora = new Date();

      // Actualizar NC
      const ncUpdate = {
        estadoSri: nuevoEstado,
        ultimaConsultaSri: ahora.toISOString()
      };

      if (nuevoEstado === 'AUTORIZADO') {
        ncUpdate.numeroAutorizacion = authResult?.numeroAutorizacion || authResult?.claveAcceso || claveAccesoNC;
        ncUpdate.fechaAutorizacion = authResult?.fechaAutorizacion || ahora.toISOString();
        ncUpdate.xmlAutorizado = authResult?.comprobante || authResult?.xmlAutorizado || ncData.xmlFirmado || null;
      }

      batch.update(ncRef, sanitizeFirestorePayload(ncUpdate));

      // Actualizar factura original
      const facturaClaveAcceso = ncData.facturaOriginalClaveAcceso;
      if (facturaClaveAcceso) {
        const facturaRef = adminDb.collection('ventas').doc(facturaClaveAcceso);
        const facturaUpdate = {
          notaCreditoEstado: nuevoEstado
        };

        if (nuevoEstado === 'AUTORIZADO') {
          facturaUpdate.estadoSri = 'REVERTIDA_NC';
          facturaUpdate.notaCreditoNumeroAutorizacion = ncUpdate.numeroAutorizacion;
          facturaUpdate.notaCreditoFechaAutorizacion = ncUpdate.fechaAutorizacion;
        } else if (nuevoEstado === 'NC_RECHAZADA') {
          // Restaurar factura a AUTORIZADA si la NC fue rechazada
          facturaUpdate.estadoSri = 'AUTORIZADO';
          facturaUpdate.notaCreditoEmitida = false;
        }

        batch.update(facturaRef, sanitizeFirestorePayload(facturaUpdate));
      }

      // Registro de auditoría
      const auditRef = adminDb.collection('sri_anulaciones').doc();
      batch.set(auditRef, sanitizeFirestorePayload({
        accion: 'CONSULTA_ESTADO_NC',
        notaCreditoClaveAcceso: claveAccesoNC,
        notaCreditoNumero: ncData.numeroComprobante,
        facturaClaveAcceso: ncData.facturaOriginalClaveAcceso,
        facturaNumero: ncData.facturaOriginalNumero,
        estadoAnterior: ncData.estadoSri,
        estadoNuevo: nuevoEstado,
        respuestaSri: authResult || null,
        errorTecnico: errorTecnico || null,
        usuarioUid: decodedToken.uid,
        fechaConsulta: ahora.toISOString(),
        createdAt: ahora.toISOString()
      }));

      await batch.commit();
      console.log(`[NC CONSULTA] Estado actualizado: ${ncData.estadoSri} → ${nuevoEstado}`);
    }

    return res.status(200).json({
      success: nuevoEstado === 'AUTORIZADO',
      estado: nuevoEstado,
      estadoAnterior: ncData.estadoSri,
      cambio: nuevoEstado !== ncData.estadoSri,
      notaCredito: {
        claveAcceso: claveAccesoNC,
        numero: ncData.numeroComprobante,
        estado: nuevoEstado,
        numeroAutorizacion: (nuevoEstado === 'AUTORIZADO')
          ? (authResult?.numeroAutorizacion || ncData.numeroAutorizacion)
          : null,
        fechaAutorizacion: (nuevoEstado === 'AUTORIZADO')
          ? (authResult?.fechaAutorizacion || ncData.fechaAutorizacion)
          : null
      },
      error: errorTecnico || null
    });

  } catch (error) {
    console.error('[NC CONSULTA] Error general:', error);
    return res.status(500).json({
      error: 'Error interno consultando estado de NC: ' + error.message
    });
  }
}
