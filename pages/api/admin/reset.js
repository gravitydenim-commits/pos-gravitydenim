import { getAdminAuth, getAdminDb, getAdminStorage } from '../../../src/lib/firebaseAdmin';

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
    
    const { action, targetMonth, targetYear, resetSequentials } = req.body;

    if (action !== 'simulate' && action !== 'execute') {
      return res.status(400).json({ error: 'Acción no válida.' });
    }

    // 2. Obtener y filtrar ventas
    const ventasRef = adminDb.collection('ventas');
    const allSalesSnap = await ventasRef.get();
    const targetSales = [];

    allSalesSnap.forEach(doc => {
      const data = doc.data();
      const fechaStr = data.fechaTransaccion || data.createdAt;
      if (fechaStr) {
        const saleDate = new Date(fechaStr);
        if (!isNaN(saleDate.getTime())) {
          let matches = true;
          if (targetYear !== undefined && targetYear !== null && targetYear !== '') {
            if (saleDate.getFullYear() !== parseInt(targetYear)) matches = false;
          }
          if (targetMonth !== undefined && targetMonth !== null && targetMonth !== '') {
            if (saleDate.getMonth() + 1 !== parseInt(targetMonth)) matches = false;
          }
          if (matches) {
            targetSales.push({ id: doc.id, ref: doc.ref, data });
          }
        }
      } else {
        // Si no tiene fecha, solo califica si borramos todo
        const noFilter = (!targetYear && !targetMonth);
        if (noFilter) {
          targetSales.push({ id: doc.id, ref: doc.ref, data });
        }
      }
    });

    const numVentas = targetSales.length;
    const numFacturas = targetSales.filter(s => !s.data.isNotaVenta && s.data.estadoSri !== 'NOTA_DE_VENTA' && s.data.status !== 'NOTA_DE_VENTA').length;
    const numNotas = numVentas - numFacturas;

    // Obtener claves de acceso / IDs de transacciones de estas ventas
    const saleIds = targetSales.map(s => s.id);
    const clavesAcceso = targetSales.map(s => s.data.claveAcceso).filter(Boolean);
    const transactionIds = targetSales.map(s => s.data.transactionId).filter(Boolean);

    // Identificar sri_logs e idempotency_keys relacionados
    const sriLogsToDelete = [];
    const idempotencyKeysToDelete = [];

    // Cargar sri_logs vinculados
    if (clavesAcceso.length > 0) {
      const sriLogsRef = adminDb.collection('sri_logs');
      const sriLogsSnapshot = await sriLogsRef.get();
      sriLogsSnapshot.forEach(doc => {
        if (clavesAcceso.includes(doc.id) || saleIds.includes(doc.id) || (doc.data() && clavesAcceso.includes(doc.data().numeroComprobante))) {
          sriLogsToDelete.push({ id: doc.id, ref: doc.ref });
        }
      });
    }

    // Cargar idempotency_keys vinculadas
    if (transactionIds.length > 0) {
      const idempRef = adminDb.collection('idempotency_keys');
      const idempSnapshot = await idempRef.get();
      idempSnapshot.forEach(doc => {
        if (transactionIds.includes(doc.id) || (doc.data() && transactionIds.includes(doc.data().transactionId))) {
          idempotencyKeysToDelete.push({ id: doc.id, ref: doc.ref });
        }
      });
    }

    if (action === 'simulate') {
      return res.status(200).json({
        success: true,
        summary: {
          facturas: numFacturas,
          notasVenta: numNotas,
          totalVentas: numVentas,
          sriLogs: sriLogsToDelete.length,
          idempotencyKeys: idempotencyKeysToDelete.length
        }
      });
    }

    // --- ACCIÓN: EXECUTE ---
    
    // 1. Crear backup estructurado
    const backupData = {
      timestamp: new Date().toISOString(),
      executor: {
        uid: decodedToken.uid,
        email: decodedToken.email || 'unknown',
        name: decodedToken.name || 'unknown'
      },
      filters: { targetMonth, targetYear },
      data: {
        ventas: targetSales.map(s => ({ id: s.id, ...s.data })),
        sri_logs: sriLogsToDelete.map(l => ({ id: l.id })),
        idempotency_keys: idempotencyKeysToDelete.map(k => ({ id: k.id }))
      }
    };

    // 2. Subir backup a Firebase Storage
    try {
      const storage = getAdminStorage();
      const bucket = storage.bucket();
      const dateTag = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const backupPath = `backups/ventas/backup_ventas_${dateTag}.json`;
      const file = bucket.file(backupPath);
      
      await file.save(JSON.stringify(backupData, null, 2), {
        metadata: { 
          contentType: 'application/json',
          metadata: {
            executorEmail: decodedToken.email || 'unknown',
            executorUid: decodedToken.uid
          }
        }
      });
      console.log(`✅ Respaldo de seguridad subido a Firebase Storage: ${backupPath}`);
    } catch (storageErr) {
      console.error('Error al subir el backup a Firebase Storage:', storageErr);
      return res.status(500).json({ error: 'No se pudo realizar el respaldo de seguridad en Firebase Storage. Operación abortada.' });
    }

    // 3. Ejecutar eliminaciones en batches atómicos
    const allRefsToDelete = [
      ...targetSales.map(s => s.ref),
      ...sriLogsToDelete.map(l => l.ref),
      ...idempotencyKeysToDelete.map(k => k.ref)
    ];

    const CHUNK_SIZE = 400;
    for (let i = 0; i < allRefsToDelete.length; i += CHUNK_SIZE) {
      const chunk = allRefsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = adminDb.batch();
      chunk.forEach(ref => {
        batch.delete(ref);
      });
      await batch.commit();
    }

    // 4. Reiniciar secuenciales si procede
    const isTotalReset = (!targetMonth && !targetYear);
    if (resetSequentials && isTotalReset) {
      const issuersRef = adminDb.collection('issuers');
      const issuersSnap = await issuersRef.get();
      const issuerBatch = adminDb.batch();
      issuersSnap.docs.forEach(doc => {
        issuerBatch.update(doc.ref, { secuenciales: {} });
      });
      await issuerBatch.commit();
      console.log('✅ Secuenciales de emisores reiniciados a cero.');
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Base de datos de ventas reiniciada exitosamente.',
      deletedCount: allRefsToDelete.length
    });

  } catch (error) {
    console.error('Error al reiniciar base de datos:', error);
    return res.status(500).json({ error: 'Error interno: ' + error.message });
  }
}
