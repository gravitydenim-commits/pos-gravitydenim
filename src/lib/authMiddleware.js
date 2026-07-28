/**
 * authMiddleware.js — Helper centralizado de autorización para API routes.
 *
 * DISEÑO RBAC PURO:
 * - Nunca compara nombres de roles ("Administrador", "Vendedor", etc.).
 * - Siempre resuelve los permisos efectivos del usuario desde Firestore.
 * - El único fallback basado en UID es para el "super admin de emergencia":
 *   permite recuperar acceso si su documento Firestore se borra accidentalmente.
 *   Este UID se configura en la variable de entorno SUPER_ADMIN_UID.
 *
 * Uso:
 *   import { verifyAuth, requirePermission } from '../../../src/lib/authMiddleware';
 *
 *   const { uid, effectivePerms } = await verifyAuth(req, adminAuth, adminDb);
 *   requirePermission(effectivePerms, 'usuarios', 'editar');  // lanza 403 si no tiene acceso
 */

import { getAdminAuth, getAdminDb } from './firebaseAdmin';

/**
 * Resuelve los permisos efectivos de un usuario a partir de su UID.
 * Orden de prioridad:
 *   1. customPermissions del documento del usuario (tienen prioridad sobre el rol)
 *   2. permissions del rol asignado (roleId → roles/{roleId})
 *   3. {} vacío si no hay permisos configurados
 *
 * El campo `superadmin` es un booleano especial dentro de los permisos.
 * Si es true, el usuario tiene acceso total sin verificar módulos individuales.
 */
export async function resolveEffectivePermissions(uid, adminDb) {
  // Fallback de emergencia: UID en variable de entorno (jamás hardcodeado en lógica de negocio)
  const EMERGENCY_UID = process.env.SUPER_ADMIN_UID;
  if (EMERGENCY_UID && uid === EMERGENCY_UID) {
    return { superadmin: true };
  }

  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) return {};

  const userData = userDoc.data();

  // 1. Permisos personalizados (sobreescriben el rol)
  if (userData.customPermissions && Object.keys(userData.customPermissions).length > 0) {
    return userData.customPermissions;
  }

  // 2. Permisos del rol asignado
  if (userData.roleId) {
    const roleDoc = await adminDb.collection('roles').doc(userData.roleId).get();
    if (roleDoc.exists) {
      return roleDoc.data().permissions || {};
    }
  }

  return {};
}

/**
 * Verifica el JWT del request y devuelve { uid, effectivePerms }.
 * Lanza un objeto { status, message } si el token falta o es inválido.
 */
export async function verifyAuth(req) {
  const adminAuth = getAdminAuth();
  const adminDb   = getAdminDb();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('No autorizado. Falta token de autenticación.');
    err.statusCode = 401;
    throw err;
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
  } catch {
    const err = new Error('Token inválido o expirado.');
    err.statusCode = 401;
    throw err;
  }

  const effectivePerms = await resolveEffectivePermissions(decodedToken.uid, adminDb);

  return { uid: decodedToken.uid, effectivePerms };
}

/**
 * Verifica que los permisos efectivos contengan module.action === true,
 * o que el usuario sea superadmin.
 * Lanza un Error con statusCode 403 si el acceso está denegado.
 *
 * @param {object} effectivePerms  — permisos resueltos por resolveEffectivePermissions()
 * @param {string} module          — ej: 'usuarios', 'configuracion', 'auditoria'
 * @param {string} action          — ej: 'ver', 'editar', 'crear'
 */
export function requirePermission(effectivePerms, module, action) {
  if (effectivePerms?.superadmin === true) return; // acceso total
  if (effectivePerms?.[module]?.[action] === true) return; // permiso específico
  const err = new Error(`Acceso denegado. Se requiere el permiso "${module}.${action}".`);
  err.statusCode = 403;
  throw err;
}
