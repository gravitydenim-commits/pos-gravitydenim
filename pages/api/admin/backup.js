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

    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 2. Verificar que el usuario sea administrador (por UID o por rol en Firestore)
    const SUPER_ADMIN_UID = 'AHo5ztrPExZndYJPIr1aByebMsN2';
    let isAuthorized = decodedToken.uid === SUPER_ADMIN_UID;

    if (!isAuthorized) {
      const callerDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
      if (callerDoc.exists) {
        const callerData = callerDoc.data();
        let perms = callerData.customPermissions;
        if (!perms && callerData.roleId) {
          const roleDoc = await adminDb.collection('roles').doc(callerData.roleId).get();
          if (roleDoc.exists) {
            const roleData = roleDoc.data();
            if (roleData.name === 'Administrador' || roleData.name === 'Admin') isAuthorized = true;
            else perms = roleData.permissions;
          }
        }
        if (!isAuthorized && perms?.configuracion?.ver === true) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de administración.' });
    }
    
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
