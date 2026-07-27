import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

function getFallback3DImage(prod) {
  const text = `${prod?.tipoPrenda || ''} ${prod?.tipo || ''} ${prod?.categoria || ''} ${prod?.nombre || prod?.name || ''}`.toLowerCase();
  const BASE = '/product-illustrations/3d/';

  if (text.includes('polo')) return BASE + 'polo_cuello_3d.png';
  if (text.includes('camiseta') && (text.includes('mujer') || text.includes('dama'))) return BASE + 'camiseta_mujer_3d.png';
  if (text.includes('camiseta')) return BASE + 'camiseta_basica_3d.png';
  if (text.includes('camisa') && text.includes('cuadros')) return BASE + 'camisa_cuadros_3d.png';
  if (text.includes('camisa') && text.includes('gabardina')) return BASE + 'camisa_gabardina_3d.png';
  if (text.includes('camisa') && (text.includes('larga') || text.includes('ml'))) return BASE + 'camisa_manga_larga_3d.png';
  if (text.includes('camisa')) return BASE + 'camisa_manga_corta_3d.png';
  if (text.includes('blusa')) return BASE + 'blusa_3d.png';
  if (text.includes('chaqueta') && text.includes('gabardina')) return BASE + 'chaqueta_gabardina_3d.png';
  if (text.includes('chaqueta') || text.includes('ch.')) return BASE + 'chaqueta_jean_3d.png';
  if (text.includes('chaleco')) return BASE + 'chaleco_3d.png';
  if (text.includes('overol')) return BASE + 'overol_3d.png';
  if (text.includes('falda')) return BASE + 'falda_3d.png';
  if (text.includes('vestido')) return BASE + 'vestido_3d.png';
  if (text.includes('tactico') || text.includes('táctico') || text.includes('tactical')) return BASE + 'pantalon_tactico_3d.png';
  if (text.includes('cargo')) return BASE + 'pantalon_cargo_3d.png';
  if (text.includes('jogger')) return BASE + 'jogger_3d.png';
  if (text.includes('short')) return BASE + 'short_3d.png';
  if (text.includes('bermuda')) return BASE + 'bermuda_3d.png';
  if (text.includes('semitubo') || text.includes('tubo')) return BASE + 'jean_semitubo_3d.png';
  if (text.includes('baggy')) return BASE + 'jean_baggy_3d.png';
  if (text.includes('niño') || text.includes('nino') || text.includes('p. niño')) return BASE + 'jean_nino_3d.png';
  if (text.includes('jean') || text.includes('pantalon') || text.includes('pantalón') || text.includes('pant') || text.includes('ancho') || text.includes('levas')) return BASE + 'jean_recto_3d.png';

  return BASE + 'default_3d.png';
}

function getProductImageUrl(prod) {
  if (!prod) return '/product-illustrations/3d/default_3d.png';

  const fields = [prod.imageUrl, prod.image, prod.photoURL, prod.imagen];
  for (const rawUrl of fields) {
    if (typeof rawUrl === 'string' && rawUrl.trim() !== '' && rawUrl !== 'undefined' && rawUrl !== 'null' && rawUrl !== 'N/A' && !rawUrl.includes('undefined')) {
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/')) {
        return rawUrl;
      }
    }
  }

  const fileKey = prod.ilustracion3d || prod.ilustracion_3d;
  if (typeof fileKey === 'string' && fileKey.trim() !== '' && fileKey !== 'undefined' && fileKey !== 'null') {
    return `/product-illustrations/3d/${fileKey.endsWith('.png') ? fileKey : fileKey + '.png'}`;
  }

  return getFallback3DImage(prod);
}

async function testResolution() {
  const snap = await db.collection('productos').get();
  console.log("🔍 COMPROBACIÓN DE ASIGNACIÓN Y EXISTENCIA DE ARCHIVOS 3D:");

  let missingCount = 0;

  snap.forEach(doc => {
    const prod = doc.data();
    const resolvedUrl = getProductImageUrl(prod);
    
    // Si la URL es relativa (/product-illustrations/3d/...), comprobar que el archivo existe en public/
    let fileExists = true;
    if (resolvedUrl.startsWith('/')) {
      const localPath = path.join(process.cwd(), 'public', resolvedUrl);
      fileExists = fs.existsSync(localPath);
      if (!fileExists) missingCount++;
    }

    console.log(`  - "${prod.nombre || prod.name}": ${resolvedUrl} [Existe en /public: ${fileExists ? 'SÍ' : '❌ NO'}]`);
  });

  console.log("\n==================================================");
  console.log(`Archivos faltantes en /public: ${missingCount}`);
  console.log("==================================================");
}

testResolution().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
