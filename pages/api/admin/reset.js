import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';

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
    await adminAuth.verifyIdToken(idToken);
    
    const collectionsToDelete = ['ventas', 'products', 'customers', 'sri_logs', 'idempotency_keys'];

    // --- RESPALDO AUTOMÁTICO ANTES DE ELIMINAR ---
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    const backupData = {
      timestamp: new Date().toISOString(),
      data: {}
    };

    for (const coll of collectionsToDelete) {
      const snapshot = await adminDb.collection(coll).get();
      backupData.data[coll] = [];
      snapshot.forEach(doc => {
        backupData.data[coll].push({ id: doc.id, ...doc.data() });
      });
    }

    const backupFile = path.join(backupDir, `backup_auto_reset_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`✅ Respaldo automático guardado en: ${backupFile}`);

    // --- FIN RESPALDO AUTOMÁTICO ---

    // Borrado por lotes para evitar timeout o fallos de memoria
    async function deleteQueryBatch(db, query, resolve) {
      const snapshot = await query.get();
      const batchSize = snapshot.size;
      if (batchSize === 0) {
        resolve();
        return;
      }
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      // Recurse on the next process tick
      process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
      });
    }

    for (const coll of collectionsToDelete) {
      const collectionRef = adminDb.collection(coll);
      const query = collectionRef.orderBy('__name__').limit(100);
      await new Promise((resolve, reject) => {
        deleteQueryBatch(adminDb, query, resolve).catch(reject);
      });
    }

    return res.status(200).json({ success: true, message: 'Base de datos reiniciada.' });

  } catch (error) {
    console.error('Error al reiniciar base de datos:', error);
    return res.status(500).json({ error: 'Error interno: ' + error.message });
  }
}
