import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function diagnoseImages() {
  console.log("🔍 DIAGNÓSTICO DE CAMPOS E IMÁGENES EN FIRESTORE:");

  const snapProductos = await db.collection('productos').get();
  console.log(`\n📦 Colección 'productos' (${snapProductos.docs.length} documentos):`);

  let invalidCount = 0;
  const fieldsUsed = new Set();

  snapProductos.forEach(doc => {
    const p = doc.data();
    if (p.imageUrl) fieldsUsed.add('imageUrl');
    if (p.image) fieldsUsed.add('image');
    if (p.photoURL) fieldsUsed.add('photoURL');
    if (p.imagen) fieldsUsed.add('imagen');
    if (p.ilustracion3d) fieldsUsed.add('ilustracion3d');

    const val = p.imageUrl || p.image || p.photoURL || p.imagen || p.ilustracion3d || 'NINGUNO';
    const isInvalid = val === 'undefined' || val === 'null' || val === 'N/A' || val.includes('undefined');
    if (isInvalid) invalidCount++;

    console.log(`  - [ID: ${doc.id}] "${p.nombre || p.name}": ${JSON.stringify({ imageUrl: p.imageUrl, image: p.image, photoURL: p.photoURL, imagen: p.imagen, ilustracion3d: p.ilustracion3d })}`);
  });

  const snapProducts = await db.collection('products').get();
  console.log(`\n📦 Colección 'products' (${snapProducts.docs.length} documentos):`);
  snapProducts.forEach(doc => {
    const p = doc.data();
    console.log(`  - [ID: ${doc.id}] "${p.nombre || p.name}": ${JSON.stringify({ imageUrl: p.imageUrl, image: p.image, photoURL: p.photoURL, imagen: p.imagen, ilustracion3d: p.ilustracion3d })}`);
  });

  console.log("\n==================================================");
  console.log(`Campos de imagen utilizados: ${Array.from(fieldsUsed).join(', ') || 'Ninguno'}`);
  console.log(`URLs o valores inválidos encontrados: ${invalidCount}`);
  console.log("==================================================");
}

diagnoseImages().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
