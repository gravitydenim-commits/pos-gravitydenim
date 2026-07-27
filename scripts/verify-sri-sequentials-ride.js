import admin from 'firebase-admin';
import fs from 'fs';
import { generateRidePdf } from '../src/lib/pdfGenerator.js';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function testSriSequentialsAndRide() {
  console.log("🧪 VERIFICANDO RIDE PDF PROFESIONAL SRI CON VALIDACIONES Y FORMAS DE PAGO MIXTAS");

  // 1. Verificar emisor Fabián
  const fabianDoc = await db.collection('issuers').doc('hermano_carlos').get();
  const fabian = fabianDoc.data();

  console.log("\n1. CONFIGURACIÓN DE FABIÁN SÁNCHEZ:");
  console.log(`   - RUC: ${fabian.ruc}`);
  console.log(`   - Razón Social: ${fabian.razonSocial}`);
  console.log(`   - Establecimiento: ${fabian.estab}`);
  console.log(`   - Punto de Emisión: ${fabian.ptoEmi}`);
  console.log(`   - Ambiente: ${fabian.ambiente === '2' ? 'PRODUCCIÓN (2)' : 'PRUEBAS (1)'}`);

  // 2. Probar validación de emisor incompleto
  console.log("\n2. PROBANDO VALIDACIÓN PREVIA DE EMISOR INCOMPLETO...");
  try {
    await generateRidePdf({
      issuerData: { ruc: '' },
      customer: { nombre: 'TEST' },
      cart: [],
      totalsData: { subtotal: 0, ivaAmount: 0, total: 0 },
      claveAcceso: '2707202601180463265900120011000000003541234567812',
      numeroComprobante: '001-100-000000354',
      fecha: new Date()
    });
    console.error("❌ Error: Debería haber fallado por falta de RUC en el emisor.");
    process.exit(1);
  } catch (errVal) {
    console.log(`✅ Validación previa correcta: "${errVal.message}"`);
  }

  // 3. Simular generación de RIDE PDF completo con pagos mixtos
  const currentSec = fabian.secuenciales['001_100'] || 354;
  const testClaveAcceso = `270720260118046326590012001100000000${currentSec}1234567812`;
  const numComprobante = `001-100-${String(currentSec).padStart(9, '0')}`;

  console.log("\n3. PROBANDO GENERACIÓN DE RIDE PDF CON PAGOS MIXTOS...");
  const pdfBuffer = await generateRidePdf({
    issuerData: fabian,
    customer: {
      nombre: 'CARLOS LOPEZ',
      numeroIdentificacion: '1803805405',
      direccion: 'AV. CEVALLOS 123',
      correo: 'carlos@ejemplo.com',
      telefono: '0991234567',
      tipoDocumento: 'CEDULA',
      vendedor: 'DIANA',
      observaciones: 'ENTREGADO EN TIENDA'
    },
    cart: [
      { sku: 'JEAN-01', name: 'JEAN SLIM FIT AZUL', qty: 2, price: 30.00, descuento: 0 },
      { sku: 'CAM-02', name: 'CAMISA CASUAL', qty: 1, price: 20.00, descuento: 0 }
    ],
    totalsData: {
      subtotal: 80.00,
      baseImponible: 80.00,
      ivaAmount: 12.00,
      total: 92.00
    },
    claveAcceso: testClaveAcceso,
    numeroComprobante: numComprobante,
    fecha: new Date(),
    paymentDetails: {
      isMixed: true,
      payments: [
        { method: 'EFECTIVO', amount: 40.00 },
        { method: 'TRANSFERENCIA', amount: 52.00, recipientName: 'Diana', reference: 'TRF-98765' }
      ]
    }
  });

  console.log(`✅ PDF generado exitosamente: ${pdfBuffer.length} bytes`);

  const pdfText = pdfBuffer.toString('utf8');
  if (pdfText.includes('undefined') || pdfText.includes('Invalid Date')) {
    console.error("❌ Error: El PDF contiene valores inválidos (undefined o Invalid Date)");
    process.exit(1);
  } else {
    console.log("✅ PDF verificado: Sin cadenas 'undefined' ni 'Invalid Date'.");
  }

  console.log("\n🎉 TODAS LAS PRUEBAS DE DISEÑO Y ESTRUCTURA DEL RIDE PDF PASARON EXITOSAMENTE.");
}

testSriSequentialsAndRide().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
