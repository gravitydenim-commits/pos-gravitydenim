import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function cleanProductImages() {
  console.log("🧹 Limpiando valores 'undefined' en imageUrl/image en la colección 'productos'...");
  const snap = await db.collection('productos').get();
  
  const batch = db.batch();
  let updatedCount = 0;

  snap.forEach(doc => {
    const data = doc.data();
    const update = {};
    if (data.imageUrl === 'undefined' || data.imageUrl === 'null') {
      update.imageUrl = admin.firestore.FieldValue.delete();
    }
    if (data.image === 'undefined' || data.image === 'null') {
      update.image = admin.firestore.FieldValue.delete();
    }
    if (data.ilustracion3d === 'undefined') {
      update.ilustracion3d = admin.firestore.FieldValue.delete();
    }
    if (Object.keys(update).length > 0) {
      batch.update(doc.ref, update);
      updatedCount++;
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`✅ ${updatedCount} productos limpiados en Firestore.`);
  } else {
    console.log("ℹ️ No se requirieron cambios en Firestore.");
  }
}

cleanProductImages().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
