import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkIssuer() {
  const issuerSnap = await db.collection('issuers').doc('hermano_geovanny').get();
  console.log("📄 Emisor hermano_geovanny secuenciales:", JSON.stringify(issuerSnap.data().secuenciales, null, 2));
}

checkIssuer().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
