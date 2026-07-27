import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function inspectIssuers() {
  const snap = await db.collection('issuers').get();
  console.log(`🏢 Se encontraron ${snap.docs.length} perfiles fiscales en Firestore:`);

  snap.forEach(doc => {
    const d = doc.data();
    console.log(`\n• [ID: ${doc.id}]`);
    console.log(`  name: ${d.name}`);
    console.log(`  razonSocial: ${d.razonSocial}`);
    console.log(`  nombreComercial: ${d.nombreComercial}`);
    console.log(`  ruc: ${d.ruc}`);
  });
}

inspectIssuers().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
