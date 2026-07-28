import { verifyAuth, requirePermission } from '../../../../src/lib/authMiddleware';
import { getAdminDb } from '../../../../src/lib/firebaseAdmin';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', // los archivos p12 pueden ser grandes
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verificar JWT y resolver permisos efectivos (RBAC puro — sin comparar nombre de rol)
    const { uid, effectivePerms } = await verifyAuth(req);

    // 2. Exigir permiso de edición de configuración
    requirePermission(effectivePerms, 'configuracion', 'editar');

    const adminDb = getAdminDb();
    const { issuerId, p12Base64, password } = req.body;

    if (!issuerId || !p12Base64 || !password) {
      return res.status(400).json({ error: 'Faltan datos obligatorios (issuerId, p12Base64, password)' });
    }

    // 3. Guardar en la bóveda de secretos
    await adminDb.collection('issuers_secrets').doc(issuerId).set({
      p12Base64,
      password,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    });

    return res.status(200).json({ success: true, message: 'Firma y contraseña guardadas en la bóveda exitosamente.' });

  } catch (error) {
    const status = error.statusCode || 500;
    const message = status < 500 ? error.message : 'Error interno del servidor al guardar el secreto.';
    console.error('Error saving issuer secret:', error);
    return res.status(status).json({ error: message });
  }
}
