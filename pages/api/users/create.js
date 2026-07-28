import { getAdminAuth, getAdminDb } from '../../../src/lib/firebaseAdmin';
import { verifyAuth, requirePermission } from '../../../src/lib/authMiddleware';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb   = getAdminDb();

    // 1. Verificar JWT y resolver permisos efectivos (RBAC puro — sin comparar nombre de rol)
    const { uid, effectivePerms } = await verifyAuth(req);

    // 2. Exigir permiso específico de gestión de usuarios
    requirePermission(effectivePerms, 'usuarios', 'editar');

    // 3. Crear el usuario en Firebase Authentication
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

    // 4. Guardar metadatos y rol en Firestore (Admin SDK omite reglas de seguridad)
    await adminDb.collection('users').doc(newAuthUser.uid).set({
      name,
      email,
      roleId: roleId || null,
      branchId: branchId || 'principal',
      active,
      customPermissions: customPermissions || null,
      createdAt: new Date().toISOString(),
      createdBy: uid,
    });

    // 5. Registrar en Auditoría
    await adminDb.collection('audit_logs').add({
      uid,
      timestamp: new Date().toISOString(),
      action: 'CREATE',
      module: 'USUARIOS',
      documentId: newAuthUser.uid,
      oldValue: null,
      newValue: { email, roleId, active },
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconocida',
    });

    return res.status(200).json({ success: true, uid: newAuthUser.uid });

  } catch (error) {
    const status = error.statusCode || 500;
    const message = status < 500 ? error.message : 'Error del servidor al crear el usuario.';
    console.error('Error in /api/users/create:', error);
    return res.status(status).json({ error: message });
  }
}
