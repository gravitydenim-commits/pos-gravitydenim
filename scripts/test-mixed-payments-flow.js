import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function testMixedPaymentsFlow() {
  console.log("🧪 PROBANDO FLUJO DE MÚLTIPLES FORMAS DE PAGO (PAGO MIXTO Y REGISTRO)");

  const totalVenta = 20.00;
  const paymentsList = [
    { id: 'p1', method: 'EFECTIVO', amount: 8.00, recipientName: '', recipientId: '', bank: '', reference: '' },
    { id: 'p2', method: 'TRANSFERENCIA', amount: 12.00, recipientName: 'Edgar', recipientId: 'edgar_id', bank: 'Pichincha', reference: '987654' }
  ];

  const totalPagado = Number(paymentsList.reduce((sum, p) => sum + p.amount, 0).toFixed(2));
  const saldoPendiente = Number((totalVenta - totalPagado).toFixed(2));

  console.log(`📌 Total Venta: $${totalVenta.toFixed(2)}`);
  console.log(`📌 Total Distribuido: $${totalPagado.toFixed(2)}`);
  console.log(`📌 Saldo Pendiente: $${saldoPendiente.toFixed(2)}`);

  if (saldoPendiente !== 0) {
    console.error("❌ Error: El saldo pendiente debe ser $0.00");
    process.exit(1);
  }

  const paymentDetails = {
    isMixed: paymentsList.length > 1,
    method: paymentsList.length === 1 ? paymentsList[0].method : 'MIXTO',
    payments: paymentsList.map(p => ({
      method: p.method,
      amount: Number(p.amount) || 0,
      recipientName: p.method === 'TRANSFERENCIA' ? p.recipientName : null,
      recipientId: p.method === 'TRANSFERENCIA' ? p.recipientId : null,
      bank: p.method === 'TRANSFERENCIA' ? p.bank : null,
      reference: p.method === 'TRANSFERENCIA' ? p.reference : null
    })),
    cashAmount: paymentsList.filter(p => p.method === 'EFECTIVO').reduce((s, p) => s + (Number(p.amount) || 0), 0),
    transfers: paymentsList.filter(p => p.method === 'TRANSFERENCIA').map(p => ({
      recipientId: p.recipientId || p.recipientName,
      recipientName: p.recipientName,
      amount: Number(p.amount) || 0,
      bank: p.bank,
      reference: p.reference
    }))
  };

  // Guardar venta de prueba en Firestore
  const testVentaId = `nv-mixed-${Date.now()}`;
  await db.collection('ventas').doc(testVentaId).set({
    id: testVentaId,
    status: 'COMPLETADA',
    tipoComprobante: 'NOTA_DE_VENTA',
    numeroComprobante: 'NV-001-001-000000999',
    total: totalVenta,
    paymentDetails: paymentDetails,
    date: new Date().toISOString()
  });

  // Verificar venta guardada
  const doc = await db.collection('ventas').doc(testVentaId).get();
  const data = doc.data();

  console.log("\n📋 DOCUMENTO FIRESTORE:");
  console.log(`  - ID: ${data.id}`);
  console.log(`  - Total Venta: $${data.total}`);
  console.log(`  - Método: ${data.paymentDetails.method}`);
  console.log(`  - Líneas de Pago:`, data.paymentDetails.payments);

  if (data.paymentDetails.payments.length === 2 && data.paymentDetails.payments[0].amount === 8 && data.paymentDetails.payments[1].amount === 12) {
    console.log("\n✅ PRUEBA EXITOSA: Múltiples formas de pago registradas correctamente.");
  } else {
    console.error("\n❌ Error en el guardado de formas de pago.");
  }
}

testMixedPaymentsFlow().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
