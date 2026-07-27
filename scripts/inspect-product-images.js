import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function inspectProductImages() {
  const snap = await db.collection('productos').get();
  console.log(`📦 Se encontraron ${snap.docs.length} productos en Firestore.`);

  snap.forEach(doc => {
    const p = doc.data();
    console.log(`- ${p.nombre || p.name}: imageUrl="${p.imageUrl}", image="${p.image}", ilustracion3d="${p.ilustracion3d || p.ilustracion_3d}"`);
  });
}

inspectProductImages().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
