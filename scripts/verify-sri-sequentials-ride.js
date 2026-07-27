import admin from 'firebase-admin';
import fs from 'fs';
import { generateRidePdf } from '../src/lib/pdfGenerator.js';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function testSriSequentialsAndRide() {
  console.log("🧪 VERIFICANDO CONTROL DE SECUENCIALES Y GENERACIÓN DE RIDE EN PRODUCCIÓN");

  // 1. Verificar emisor Fabián
  const fabianDoc = await db.collection('issuers').doc('hermano_carlos').get();
  const fabian = fabianDoc.data();

  console.log("\n1. CONFIGURACIÓN DE FABIÁN SÁNCHEZ:");
  console.log(`   - RUC: ${fabian.ruc}`);
  console.log(`   - Razón Social: ${fabian.razonSocial}`);
  console.log(`   - Establecimiento: ${fabian.estab}`);
  console.log(`   - Punto de Emisión: ${fabian.ptoEmi}`);
  console.log(`   - Ambiente: ${fabian.ambiente === '2' ? 'PRODUCCIÓN (2)' : 'PRUEBAS (1)'}`);
  console.log(`   - Secuenciales:`, fabian.secuenciales);

  if (fabian.estab !== '001' || fabian.ptoEmi !== '100') {
    console.error("❌ Error: Fabián debe usar estab 001 y ptoEmi 100");
    process.exit(1);
  }

  const currentSec = fabian.secuenciales['001_100'];
  console.log(`\n📌 Secuencial actual disponible en Firestore: ${currentSec}`);

  // 2. Simular generación de RIDE PDF
  const testClaveAcceso = `270720260118046326590012001100000000${currentSec}1234567812`;
  const numComprobante = `001-100-String(${currentSec}).padStart(9, '0')`;

  console.log("\n2. PROBANDO GENERACIÓN DE RIDE PDF...");
  const pdfBuffer = await generateRidePdf({
    issuerData: fabian,
    customer: {
      nombre: 'JUAN PEREZ',
      numeroIdentificacion: '1803805405',
      direccion: 'AMBATO - CENTRO',
      tipoDocumento: 'CEDULA'
    },
    cart: [
      { sku: 'JEAN-01', name: 'JEAN CLASSIC AZUL', qty: 2, price: 25.00 }
    ],
    totalsData: {
      subtotal: 50.00,
      baseImponible: 50.00,
      ivaAmount: 7.50,
      total: 57.50
    },
    claveAcceso: testClaveAcceso,
    numeroComprobante: `001-100-${String(currentSec).padStart(9, '0')}`,
    fecha: new Date()
  });

  console.log(`✅ PDF generado exitosamente: ${pdfBuffer.length} bytes`);

  // Verificar que el PDF no contenga cadenas defectuosas
  const pdfText = pdfBuffer.toString('utf8');
  if (pdfText.includes('undefined') || pdfText.includes('Invalid Date')) {
    console.error("❌ Error: El PDF contiene valores inválidos (undefined o Invalid Date)");
    process.exit(1);
  } else {
    console.log("✅ PDF verificado: Sin cadenas 'undefined' ni 'Invalid Date'.");
  }

  console.log("\n🎉 TODAS LAS VERIFICACIONES PASARON EXITOSAMENTE.");
}

testSriSequentialsAndRide().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
