/**
 * migrate-admin-role.js
 * 
 * Migra el rol "Administrador" (o "Admin") en Firestore para incluir
 * { superadmin: true } en su campo de permisos.
 * 
 * Esto es necesario para que usePermissions.js (RBAC puro) reconozca
 * al usuario como administrador sin comparar el nombre del rol.
 * 
 * Uso: node migrate-admin-role.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function migrateAdminRole() {
  console.log('🔍 Buscando roles de administrador en Firestore...\n');

  const rolesSnap = await db.collection('roles').get();
  
  let updated = 0;
  let skipped = 0;

  for (const roleDoc of rolesSnap.docs) {
    const data = roleDoc.data();
    const name = data.name || '';
    const perms = data.permissions || {};

    const isAdminRole = 
      name.toLowerCase() === 'administrador' || 
      name.toLowerCase() === 'admin';

    if (isAdminRole) {
      if (perms.superadmin === true) {
        console.log(`  ⏭️  Rol "${name}" (${roleDoc.id}) ya tiene superadmin: true — sin cambios.`);
        skipped++;
      } else {
        await db.collection('roles').doc(roleDoc.id).update({
          'permissions.superadmin': true,
        });
        console.log(`  ✅ Rol "${name}" (${roleDoc.id}) actualizado con superadmin: true`);
        updated++;
      }
    } else {
      console.log(`  ℹ️  Rol "${name}" (${roleDoc.id}) — no es admin, sin cambios.`);
    }
  }

  console.log(`\n📊 Resultado: ${updated} rol(es) actualizado(s), ${skipped} ya estaban correctos.`);
  console.log('\n✅ Migración completada. El sistema RBAC puro ya reconocerá correctamente al Administrador.');
  process.exit(0);
}

migrateAdminRole().catch((err) => {
  console.error('❌ Error durante la migración:', err);
  process.exit(1);
});
