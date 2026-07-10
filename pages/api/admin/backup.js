import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    
    // 1. Validar JWT (lo pasamos por query param o header, vamos a usar header preferiblemente, o query si es una descarga directa)
    let idToken = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      idToken = authHeader.split('Bearer ')[1];
    } else if (req.query.token) {
      idToken = req.query.token;
    }

    if (!idToken) {
      return res.status(401).json({ error: 'No autorizado. Falta token.' });
    }

    await adminAuth.verifyIdToken(idToken);
    
    const collectionsToBackup = ['ventas', 'products', 'customers', 'sri_logs', 'issuers', 'settings'];
    const backupData = {
      timestamp: new Date().toISOString(),
      data: {}
    };

    for (const coll of collectionsToBackup) {
      const snapshot = await adminDb.collection(coll).get();
      backupData.data[coll] = [];
      snapshot.forEach(doc => {
        backupData.data[coll].push({ id: doc.id, ...doc.data() });
      });
    }

    // Configurar headers para forzar la descarga de un JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="respaldo_pos_${new Date().toISOString().slice(0,10)}.json"`);

    return res.status(200).send(JSON.stringify(backupData, null, 2));

  } catch (error) {
    console.error('Error al generar respaldo:', error);
    return res.status(500).json({ error: 'Error interno: ' + error.message });
  }
}
