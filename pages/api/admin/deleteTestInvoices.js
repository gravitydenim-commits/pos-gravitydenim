process.env.TZ = 'America/Guayaquil';

import { verifyAuth, requirePermission } from '../../../src/lib/authMiddleware';
import { getAdminAuth, getAdminDb, getAdminStorage } from '../../../src/lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verificar JWT y permisos efectivos (RBAC puro)
    const { uid, effectivePerms } = await verifyAuth(req);
    requirePermission(effectivePerms, 'configuracion', 'eliminar');

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // Obtener token y datos del administrador executor
    const authHeader = req.headers.authorization;
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 2. Obtener claveAcceso o invoiceId
    const { claveAcceso } = req.body;
    if (!claveAcceso) {
      return res.status(400).json({ error: 'Falta la clave de acceso (claveAcceso).' });
    }

    // 3. Obtener la venta/factura a eliminar
    const ventaRef = adminDb.collection('ventas').doc(claveAcceso);
    const ventaDoc = await ventaRef.get();

    if (!ventaDoc.exists) {
      return res.status(404).json({ error: 'La factura no existe en el sistema.' });
    }

    const ventaData = ventaDoc.data();

    // 4. Bloqueo de seguridad definitivo: NUNCA permitir borrar un comprobante AUTORIZADO
    const estadoSri = (ventaData.estadoSri || ventaData.status || '').toUpperCase();
    const numeroAutorizacion = ventaData.numeroAutorizacion;
    const fechaAutorizacion = ventaData.fechaAutorizacion;

    const hasAuthNum = !!(numeroAutorizacion && String(numeroAutorizacion).trim() !== '' && numeroAutorizacion !== 'N/A');
    const hasAuthDate = !!(fechaAutorizacion && String(fechaAutorizacion).trim() !== '' && fechaAutorizacion !== 'N/A');

    if (estadoSri === 'AUTORIZADO' || estadoSri === 'AUTORIZADA' || hasAuthNum || hasAuthDate) {
      return res.status(403).json({
        error: 'Operación prohibida. No se puede eliminar un comprobante que posee autorización del SRI o está en estado AUTORIZADO.'
      });
    }

    // 5. Cargar logs de SRI relacionados de forma exhaustiva
    const ventaId = ventaDoc.id;
    const docClaveAcceso = ventaData.claveAcceso;
    const docNumComprobante = ventaData.numeroComprobante;

    const sriLogsToDelete = [];
    const sriLogsRef = adminDb.collection('sri_logs');
    const sriLogsSnapshot = await sriLogsRef.get();
    sriLogsSnapshot.forEach(doc => {
      const data = doc.data() || {};
      const matches = 
        doc.id === ventaId || 
        (docClaveAcceso && doc.id === docClaveAcceso) || 
        (docClaveAcceso && data.numeroComprobante === docClaveAcceso) ||
        (docNumComprobante && data.numeroComprobante === docNumComprobante) ||
        (ventaId && data.numeroComprobante === ventaId);
      if (matches) {
        sriLogsToDelete.push({ id: doc.id, ref: doc.ref, data });
      }
    });

    // 6. Cargar idempotency_keys relacionadas
    const idempotencyKeysToDelete = [];
    const transactionId = ventaData.transactionId;
    if (transactionId) {
      const idempRef = adminDb.collection('idempotency_keys');
      const idempSnapshot = await idempRef.get();
      idempSnapshot.forEach(doc => {
        const data = doc.data() || {};
        if (doc.id === transactionId || data.transactionId === transactionId) {
          idempotencyKeysToDelete.push({ id: doc.id, ref: doc.ref, data });
        }
      });
    }

    // 7. Crear backup estructurado en Firebase Storage
    const dateTag = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupData = {
      timestamp: new Date().toISOString(),
      executor: {
        uid: decodedToken.uid,
        email: decodedToken.email || 'unknown',
        name: decodedToken.name || 'unknown'
      },
      deletedInvoice: claveAcceso,
      data: {
        venta: { id: ventaDoc.id, ...ventaData },
        sri_logs: sriLogsToDelete.map(l => ({ id: l.id, ...l.data })),
        idempotency_keys: idempotencyKeysToDelete.map(k => ({ id: k.id, ...k.data }))
      }
    };

    try {
      const storage = getAdminStorage();
      const bucket = storage.bucket();
      const backupPath = `backups/ventas/deleted_invoice_${claveAcceso}_${dateTag}.json`;
      const file = bucket.file(backupPath);

      await file.save(JSON.stringify(backupData, null, 2), {
        metadata: {
          contentType: 'application/json',
          metadata: {
            executorEmail: decodedToken.email || 'unknown',
            executorUid: decodedToken.uid,
            deletedClaveAcceso: claveAcceso
          }
        }
      });
      console.log(`✅ Respaldo de seguridad de factura ${claveAcceso} subido a Storage: ${backupPath}`);
    } catch (storageErr) {
      console.error('Error al subir el backup a Firebase Storage:', storageErr);
      return res.status(500).json({
        error: 'No se pudo realizar el respaldo de seguridad en Firebase Storage. Operación abortada.',
        details: storageErr.message,
        stack: storageErr.stack
      });
    }

    // 8. Ejecutar eliminaciones en un batch atómico
    const batch = adminDb.batch();
    batch.delete(ventaRef);
    sriLogsToDelete.forEach(l => batch.delete(l.ref));
    idempotencyKeysToDelete.forEach(k => batch.delete(k.ref));

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: 'Comprobante y todos los registros relacionados eliminados correctamente.',
      summary: {
        ventas: 1,
        sriLogs: sriLogsToDelete.length,
        idempotencyKeys: idempotencyKeysToDelete.length
      }
    });

  } catch (error) {
    const status = error.statusCode || 500;
    const message = status < 500 ? error.message : 'Error interno al procesar la eliminación del comprobante.';
    console.error('Error al eliminar comprobante:', error);
    return res.status(status).json({ error: message });
  }
}
