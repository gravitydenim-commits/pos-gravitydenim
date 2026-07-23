import admin from 'firebase-admin';
import fs from 'fs';
import { generateRidePdf } from '../src/lib/pdfGenerator.js';
import { sendInvoiceEmail } from '../src/lib/mailer.js';

process.env.TZ = 'America/Guayaquil';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function testEmailFlow() {
  console.log("==================================================");
  console.log("📧 PRUEBA DE ENVÍO DE EMAIL DE FACTURA AUTORIZADA");
  console.log("==================================================");

  // Obtener factura 001-001-000000002
  const snap = await db.collection('ventas').where('numeroComprobante', '==', '001-001-000000002').get();
  if (snap.empty) {
    console.error("❌ Factura 001-001-000000002 no encontrada.");
    process.exit(1);
  }

  const docData = snap.docs[0].data();
  const claveAcceso = docData.claveAcceso || snap.docs[0].id;
  const clienteEmail = docData.cliente?.correo || docData.cliente?.email || 'gravitydenim@gmail.com';

  console.log(`📌 Factura: ${docData.numeroComprobante}`);
  console.log(`📌 Clave Acceso: ${claveAcceso}`);
  console.log(`📌 Estado SRI: ${docData.estadoSri}`);
  console.log(`📌 Destinatario: ${clienteEmail}`);

  // 1. Obtener emisor
  const emisorId = docData.emisorId || 'hermano_geovanny';
  const emisorSnap = await db.collection('issuers').doc(emisorId).get();
  const issuerData = emisorSnap.exists ? emisorSnap.data() : { name: "GRAVITY DENIM", ruc: "1803805405001" };

  // 2. Generar PDF RIDE
  console.log("\n📄 Generando PDF RIDE de la factura autorizada...");
  const cart = (docData.productos || docData.items || []).map(p => ({
    id: p.id,
    sku: p.codigoBarras || p.sku || p.codigo || '',
    name: p.name || p.nombre,
    qty: p.qty || p.cantidad || 1,
    price: p.price || p.precio || 0
  }));

  const pdfBuffer = await generateRidePdf({
    issuerData,
    customer: docData.cliente || { nombre: 'CONSUMIDOR FINAL', numeroIdentificacion: '9999999999999' },
    cart,
    totalsData: docData.totals || { subtotal: docData.subtotal || 0, ivaAmount: docData.ivaAmount || 0, total: docData.total || 0 },
    claveAcceso,
    numeroComprobante: docData.numeroComprobante,
    fecha: new Date(docData.fechaTransaccion || Date.now())
  });

  console.log(`✅ PDF RIDE generado. Tamaño: ${pdfBuffer.length} bytes.`);

  // 3. XML Autorizado
  const xmlBuffer = docData.xmlAutorizado || docData.xmlFirmado || '<xml></xml>';
  console.log(`✅ XML listo. Tamaño: ${xmlBuffer.length} bytes.`);

  // 4. Intentar Envío de Correo
  console.log("\n✉️ Ejecutando sendInvoiceEmail...");
  const result = await sendInvoiceEmail({
    customerEmail: clienteEmail,
    pdfBuffer,
    xmlBuffer,
    claveAcceso,
    issuerName: issuerData.name || 'GRAVITY DENIM',
    numeroComprobante: docData.numeroComprobante
  });

  console.log("\n==================================================");
  console.log("RESULTADO DE ENVÍO DE EMAIL:");
  console.log(JSON.stringify(result, null, 2));

  // 5. Actualizar en Firestore
  const estadoEmail = result.success ? 'ENVIADO' : 'ERROR_ENVIO';
  await db.collection('ventas').doc(snap.docs[0].id).update({
    estadoEmail,
    emailStatus: estadoEmail,
    emailResult: result,
    emailError: result.success ? null : (result.error || 'Error de envío'),
    ultimoEnvioEmail: new Date().toISOString()
  });

  console.log(`\n✅ Documento Firestore actualizado: estadoEmail = '${estadoEmail}', estadoSri = '${docData.estadoSri}' (Sigue AUTORIZADO)`);
  console.log("==================================================");
}

testEmailFlow().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
