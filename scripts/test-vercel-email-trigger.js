import admin from 'firebase-admin';
import fs from 'fs';

process.env.TZ = 'America/Guayaquil';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkVercelEmailResult() {
  const claveAcceso = '2307202601180380540500120010010000000022307002314';
  console.log(`🔍 Inspeccionando documento en Firestore para clave: ${claveAcceso}...`);

  const docSnap = await db.collection('ventas').doc(claveAcceso).get();
  if (!docSnap.exists) {
    console.error("❌ Documento no existe.");
    process.exit(1);
  }

  const data = docSnap.data();
  console.log("\n==================================================");
  console.log("📄 ESTADO ACTUAL EN FIRESTORE (POST-REDEPLOY):");
  console.log("==================================================");
  console.log(`• Comprobante:           ${data.numeroComprobante}`);
  console.log(`• Estado SRI:            ${data.estadoSri}`);
  console.log(`• Cliente Correo:        ${data.cliente?.correo || data.cliente?.email || 'N/A'}`);
  console.log(`• Estado Email:          ${data.estadoEmail || data.emailStatus || 'PENDIENTE'}`);
  console.log(`• Último Envío Email:    ${data.ultimoEnvioEmail || 'N/A'}`);
  console.log(`• Error Email (si hay):  ${data.emailError || 'Ninguno (EXITOSO)'}`);
  console.log(`• Resultado Email:`);
  console.log(JSON.stringify(data.emailResult || null, null, 2));
  console.log("==================================================");
}

checkVercelEmailResult().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
