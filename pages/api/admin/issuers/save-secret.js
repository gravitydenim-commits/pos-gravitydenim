import { getAdminAuth, getAdminDb } from '../../../../src/lib/firebaseAdmin';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', // p12 files can be large, though usually small
    },
  },
};

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
    
    // 2. Validar que el usuario sea Admin o tenga permisos
    const SUPER_ADMIN_UID = 'AHo5ztrPExZndYJPIr1aByebMsN2';
    let isAuthorized = false;

    if (decodedToken.uid === SUPER_ADMIN_UID) {
      isAuthorized = true;
    } else {
      const callerDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
      if (callerDoc.exists) {
        const callerData = callerDoc.data();
        let perms = callerData.customPermissions;
        if (!perms && callerData.roleId) {
          const roleDoc = await adminDb.collection('roles').doc(callerData.roleId).get();
          if (roleDoc.exists) perms = roleDoc.data().permissions;
        }
        if (perms && perms.configuracion && perms.configuracion.editar === true) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de administración.' });
    }

    const { issuerId, p12Base64, password } = req.body;

    if (!issuerId || !p12Base64 || !password) {
      return res.status(400).json({ error: 'Faltan datos obligatorios (issuerId, p12Base64, password)' });
    }

    // 3. Guardar en la bóveda
    const vaultRef = adminDb.collection('issuers_secrets').doc(issuerId);
    
    await vaultRef.set({
      p12Base64,
      password,
      updatedAt: new Date().toISOString(),
      updatedBy: decodedToken.uid
    });

    return res.status(200).json({ success: true, message: 'Firma y contraseña guardadas en la bóveda exitosamente.' });
  } catch (error) {
    console.error('Error saving issuer secret:', error);
    return res.status(500).json({ error: 'Error interno del servidor al guardar el secreto.' });
  }
}
