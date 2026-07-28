import { verifyAuth, requirePermission } from '../../../src/lib/authMiddleware';
import { getAdminDb } from '../../../src/lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verificar JWT y resolver permisos efectivos (RBAC puro — sin comparar nombre de rol)
    const { uid, effectivePerms } = await verifyAuth(req);

    // 2. Exigir permiso de configuración para descargar el respaldo
    requirePermission(effectivePerms, 'configuracion', 'ver');

    const adminDb = getAdminDb();
    const collectionsToBackup = ['ventas', 'products', 'customers', 'sri_logs', 'issuers', 'settings'];
    const backupData = {
      timestamp: new Date().toISOString(),
      generatedBy: uid,
      data: {}
    };

    for (const coll of collectionsToBackup) {
      const snapshot = await adminDb.collection(coll).get();
      backupData.data[coll] = [];
      snapshot.forEach(doc => {
        backupData.data[coll].push({ id: doc.id, ...doc.data() });
      });
    }

    // Forzar descarga como archivo JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="respaldo_pos_${new Date().toISOString().slice(0,10)}.json"`);

    return res.status(200).send(JSON.stringify(backupData, null, 2));

  } catch (error) {
    const status = error.statusCode || 500;
    const message = status < 500 ? error.message : 'Error interno al generar el respaldo.';
    console.error('Error al generar respaldo:', error);
    return res.status(status).json({ error: message });
  }
}
