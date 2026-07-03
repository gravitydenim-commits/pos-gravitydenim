import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    
    // 1. Validar Token de Autenticación (JWT)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Falta token.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    // 2. Verificar Permisos (Mínimo Privilegio)
    const SUPER_ADMIN_UID = 'AHo5ztrPExZndYJPIr1aByebMsN2';
    let hasAccess = false;

    if (decodedToken.uid === SUPER_ADMIN_UID) {
      hasAccess = true;
    } else {
      const callerDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
      if (callerDoc.exists) {
        const callerData = callerDoc.data();
        let perms = callerData.customPermissions;
        if (!perms && callerData.roleId) {
          const roleDoc = await adminDb.collection('roles').doc(callerData.roleId).get();
          if (roleDoc.exists) perms = roleDoc.data().permissions;
        }
        if (perms && perms.usuarios && perms.usuarios.editar === true) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Acceso denegado. No tienes permisos para crear usuarios.' });
    }

    // 3. Crear el Usuario en Firebase Authentication
    const { name, email, password, roleId, branchId, active, customPermissions } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (email, name, password).' });
    }

    const newAuthUser = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: !active,
    });

    // 4. Guardar los metadatos y roles en Firestore (Saltándose reglas de seguridad porque es Admin SDK)
    await adminDb.collection('users').doc(newAuthUser.uid).set({
      name,
      email,
      roleId: roleId || null,
      branchId: branchId || 'principal',
      active,
      customPermissions: customPermissions || null,
      createdAt: new Date().toISOString(),
      createdBy: decodedToken.uid
    });

    // 5. Registrar en Auditoría
    await adminDb.collection('audit_logs').add({
      uid: decodedToken.uid,
      userName: decodedToken.name || decodedToken.email,
      timestamp: new Date().toISOString(),
      action: 'CREATE',
      module: 'USUARIOS',
      documentId: newAuthUser.uid,
      oldValue: null,
      newValue: { email, roleId, active },
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconocida'
    });

    res.status(200).json({ success: true, uid: newAuthUser.uid    });

  } catch (error) {
    console.error('Error in /api/users/create:', error);
    return res.status(500).json({ error: 'Error del servidor: ' + (error.message || 'Desconocido') });
  }
}
