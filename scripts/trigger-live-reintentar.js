import admin from 'firebase-admin';
import fs from 'fs';

process.env.TZ = 'America/Guayaquil';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function triggerLiveReintentar() {
  console.log("🔑 Generando token de autenticación para consultar endpoint Vercel...");
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCaLpC-jUXG-N_yyNPm6NAepPVzCmqNtZo";
  const customToken = await admin.auth().createCustomToken('redeploy_tester');

  const resAuth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });

  const authData = await resAuth.json();
  const idToken = authData.idToken;
  console.log("✅ Token ID de Firebase obtenido.");

  const claveAcceso = '2307202601180380540500120010010000000022307002314';
  
  // Posibles dominios de Vercel
  const domains = [
    'https://pos-gravitydenim.vercel.app',
    'https://pos-gravitydenim-git-main-gravitydenim-commits.vercel.app'
  ];

  let successCalled = false;

  for (const domain of domains) {
    try {
      console.log(`\n🚀 Invocando GET/POST en Vercel: ${domain}/api/sri/reintentar ...`);
      const response = await fetch(`${domain}/api/sri/reintentar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ claveAcceso })
      });

      const status = response.status;
      const text = await response.text();
      console.log(`📡 Respuesta del endpoint Vercel (HTTP ${status}):`, text);

      if (response.ok || status === 200 || status === 400) {
        successCalled = true;
        break;
      }
    } catch (e) {
      console.warn(`⚠️ Error conectando a ${domain}:`, e.message);
    }
  }

  // Esperar 2 segundos para dar tiempo a que el background task de Firestore se persista
  await new Promise(r => setTimeout(r, 2500));

  // Inspeccionar Firestore para ver el estado final del correo
  console.log("\n🔍 Leyendo resultado final del correo en Firestore...");
  const docSnap = await db.collection('ventas').doc(claveAcceso).get();
  if (docSnap.exists) {
    const data = docSnap.data();
    console.log("\n==================================================");
    console.log("📊 RESULTADO FINAL DEL ENVÍO DE EMAIL EN PRODUCCIÓN:");
    console.log("==================================================");
    console.log(`• Comprobante: ${data.numeroComprobante}`);
    console.log(`• Clave Acceso: ${claveAcceso}`);
    console.log(`• Estado SRI: ${data.estadoSri}`);
    console.log(`• Cliente Correo: ${data.cliente?.correo || data.cliente?.email || 'N/A'}`);
    console.log(`• Estado Email: ${data.estadoEmail || data.emailStatus || 'PENDIENTE'}`);
    console.log(`• Error Email (si hubo): ${data.emailError || 'NINGUNO'}`);
    console.log(`• Resultado SMTP:`, JSON.stringify(data.emailResult || null, null, 2));
    console.log("==================================================");
  }
}

triggerLiveReintentar().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
