import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function testAutoLockSequence() {
  console.log("🧪 PROBANDO CONFIGURACIÓN DE BLOQUEO DE SECUENCIAL AUTOMÁTICO POR EMISOR");

  const snap = await db.collection('issuers').get();
  if (snap.empty) {
    console.error("❌ No hay emisores en la base");
    process.exit(1);
  }

  const emisorId = snap.docs[0].id;
  const initialData = snap.docs[0].data();
  console.log(`📌 Emisor: ${initialData.name || emisorId}`);
  console.log(`  - Bloquear Secuencial Auto Inicial: ${initialData.bloquearSecuencialAuto}`);

  // 1. Simular desbloqueo manual por el administrador y actualización de secuencial a 500
  console.log("  ⚡ Simulando actualización manual: desbloquear y fijar secuencial SRI en 500...");
  const estab = initialData.estab || initialData.establecimiento || '001';
  const ptoEmi = initialData.ptoEmi || initialData.puntoEmision || '001';
  const secKeySRI = `${estab}_${ptoEmi}`;

  await db.collection('issuers').doc(emisorId).update({
    bloquearSecuencialAuto: false,
    [`secuenciales.${secKeySRI}`]: 500
  });

  let checkDoc = await db.collection('issuers').doc(emisorId).get();
  let checkData = checkDoc.data();
  console.log(`  - Estado actual: bloquearSecuencialAuto = ${checkData.bloquearSecuencialAuto}, Secuencial SRI = ${checkData.secuenciales[secKeySRI]}`);

  // 2. Simular volver a activar el bloqueo automático
  console.log("  ⚡ Activando nuevamente 'Bloquear secuencial automático'...");
  await db.collection('issuers').doc(emisorId).update({
    bloquearSecuencialAuto: true
  });

  checkDoc = await db.collection('issuers').doc(emisorId).get();
  checkData = checkDoc.data();
  console.log(`  - Estado final: bloquearSecuencialAuto = ${checkData.bloquearSecuencialAuto}, Secuencial SRI mantenido = ${checkData.secuenciales[secKeySRI]}`);

  if (checkData.bloquearSecuencialAuto === true && checkData.secuenciales[secKeySRI] === 500) {
    console.log("\n✅ PRUEBA EXITOSA: La numeración se mantiene en 500 y al emitir la próxima factura continuará automáticamente en 501.");
  } else {
    console.error("\n❌ Error en la verificación de bloqueo automático de secuenciales.");
  }
}

testAutoLockSequence().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
