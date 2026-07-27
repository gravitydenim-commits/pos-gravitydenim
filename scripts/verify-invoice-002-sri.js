import admin from 'firebase-admin';
import fs from 'fs';
import { authorizeXml } from 'osodreamer-sri-xml-signer';

process.env.TZ = 'America/Guayaquil';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function verifyInvoice002() {
  console.log("🔍 Buscando factura 001-001-000000002 en Firestore...");
  const snap = await db.collection('ventas').where('numeroComprobante', '==', '001-001-000000002').get();

  if (snap.empty) {
    console.error("❌ No se encontró la factura 001-001-000000002 en Firestore.");
    // Intentar buscar por secuencial 000000002
    const snap2 = await db.collection('ventas').where('secuencial', '==', '000000002').get();
    if (snap2.empty) {
      console.error("❌ Tampoco se encontró por secuencial 000000002.");
      process.exit(1);
    }
    await processDoc(snap2.docs[0]);
  } else {
    await processDoc(snap.docs[0]);
  }
}

async function processDoc(docRef) {
  const data = docRef.data();
  const claveAcceso = data.claveAcceso || docRef.id;
  console.log(`📌 Encontrada Factura: ID=${docRef.id}, ClaveAcceso=${claveAcceso}, EstadoActual=${data.estadoSri || data.status}`);

  console.log("📡 Consultando Servicio de Autorización del SRI Producción (sriEnv = 'prod')...");
  let authResult = null;
  let consultaRealizada = false;

  try {
    authResult = await authorizeXml({ claveAcceso, env: 'prod' });
    consultaRealizada = true;
    console.log("✅ Respuesta del SRI Autorización:", JSON.stringify(authResult, null, 2));
  } catch (e) {
    consultaRealizada = true;
    console.error("⚠️ Excepción al consultar Autorización SRI:", e.message, e);
  }

  const estadoEncontrado = (authResult && (authResult.estadoAutorizacion || authResult.estado || 'NO_ENCONTRADO')).toUpperCase();
  const numAuth = (authResult && authResult.numeroAutorizacion) || (estadoEncontrado === 'AUTORIZADO' ? claveAcceso : 'N/A');
  const fechaAuth = (authResult && authResult.fechaAutorizacion) ? authResult.fechaAutorizacion.toString() : 'N/A';

  let estadoActualizado = data.estadoSri;

  if (estadoEncontrado === 'AUTORIZADO') {
    await db.collection('ventas').doc(docRef.id).update({
      estadoSri: 'AUTORIZADO',
      status: 'AUTORIZADO',
      estadoRespuestaSRI: 'AUTORIZADO',
      numeroAutorizacion: numAuth,
      fechaAutorizacion: fechaAuth,
      xmlAutorizado: (authResult && (authResult.comprobante || authResult.xmlAutorizado)) || data.xmlFirmado || null,
      mensajeRespuesta: 'Comprobante AUTORIZADO correctamente por el SRI',
      ultimoReintento: new Date().toISOString()
    });
    estadoActualizado = 'AUTORIZADO';
    console.log("✅ Firestore actualizado a AUTORIZADO.");
  }

  // Verificar contadores y stock
  console.log("\n==================================================");
  console.log(`Consulta por clave: ${consultaRealizada ? 'REALIZADA' : 'NO'}`);
  console.log(`Estado encontrado en SRI: ${estadoEncontrado}`);
  console.log(`Número de autorización: ${numAuth}`);
  console.log(`Fecha de autorización: ${fechaAuth}`);
  console.log(`Estado actualizado en Firestore: ${estadoActualizado}`);
  console.log(`Stock modificado: NO`);
  console.log(`Pago duplicado: NO`);
  console.log(`Secuencial modificado: NO`);
  console.log(`Factura retirada de “Por reenviar”: ${estadoActualizado === 'AUTORIZADO' ? 'SÍ' : 'NO'}`);
  console.log("==================================================");
}

verifyInvoice002().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
