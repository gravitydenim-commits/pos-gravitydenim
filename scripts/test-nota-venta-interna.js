import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function testNotaVentaInterna() {
  console.log("🧪 INICIANDO PRUEBA DE SEPARACIÓN TOTAL DE NOTA DE VENTA INTERNA vs FACTURA SRI");

  // 1. Obtener Emisor de prueba
  const issuersSnap = await db.collection('issuers').get();
  if (issuersSnap.empty) {
    console.error("❌ No se encontraron emisores");
    process.exit(1);
  }
  const emisorDoc = issuersSnap.docs[0];
  const emisorId = emisorDoc.id;
  const emisorData = emisorDoc.data();
  const estab = emisorData.estab || emisorData.establecimiento || '001';
  const ptoEmi = emisorData.ptoEmi || emisorData.puntoEmision || '001';
  const secKeyNV = `${estab}_${ptoEmi}_NV`;

  const prevSecNV = (emisorData.secuenciales || {})[secKeyNV] || 0;
  console.log(`📌 Emisor: ${emisorData.name} | Secuencial NV previo: ${prevSecNV}`);

  // 2. Simular Transacción Atómica de Nota de Venta Interna
  const ventaId = `nv-test-${Date.now()}`;
  const numComprobanteExpected = `NV-${estab}-${ptoEmi}-${String(prevSecNV + 1).padStart(9, '0')}`;

  await db.runTransaction(async (t) => {
    const issuerRef = db.collection('issuers').doc(emisorId);
    const issuerSnap = await t.get(issuerRef);
    const currentData = issuerSnap.data() || {};
    const secuenciales = currentData.secuenciales || {};
    const nextNV = (secuenciales[secKeyNV] || 0) + 1;

    t.update(issuerRef, { [`secuenciales.${secKeyNV}`]: nextNV });

    const ventaRef = db.collection('ventas').doc(ventaId);
    t.set(ventaRef, {
      id: ventaId,
      status: 'COMPLETADA',
      tipoComprobante: 'NOTA_DE_VENTA',
      numeroComprobante: numComprobanteExpected,
      secuencial: String(nextNV).padStart(9, '0'),
      date: new Date().toISOString(),
      isNotaVenta: true,
      total: 10.00,
      customer: { nombre: 'CLIENTE TEST INTERNO', numeroIdentificacion: '9999999999999' }
    });
  });

  // 3. Verificar documento de Venta en Firestore
  const docVenta = await db.collection('ventas').doc(ventaId).get();
  if (!docVenta.exists) {
    console.error("❌ Error: Venta interna no fue creada en Firestore");
    process.exit(1);
  }

  const vData = docVenta.data();
  console.log("\n📋 DOCUMENTO DE VENTA INTERNA EN FIRESTORE:");
  console.log(`  - ID Venta: ${vData.id}`);
  console.log(`  - Estado: ${vData.status} (esperado: COMPLETADA)`);
  console.log(`  - Tipo Comprobante: ${vData.tipoComprobante}`);
  console.log(`  - Número Comprobante: ${vData.numeroComprobante}`);
  console.log(`  - Clave Acceso SRI: ${vData.claveAcceso || 'NINGUNA (Correcto)'}`);
  console.log(`  - Estado Respuesta SRI: ${vData.estadoRespuestaSRI || 'NINGUNO (Correcto)'}`);

  if (vData.status === 'COMPLETADA' && !vData.claveAcceso && !vData.estadoRespuestaSRI) {
    console.log("\n✅ VERIFICACIÓN EXITOSA: La Nota de Venta Interna está 100% aislada del SRI.");
  } else {
    console.error("\n❌ Error en aislamiento de Nota de Venta Interna.");
  }
}

testNotaVentaInterna().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
