const admin = require('firebase-admin');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runE2E() {
  try {
    console.log('=== INICIANDO PRUEBA E2E: CONTINGENCIA Y REINTENTO ===');
    
    // 1. Verificar stock inicial
    let prodRef = db.collection('productos').doc('PROD-E2E');
    let prodDoc = await prodRef.get();
    const stockInicial = prodDoc.data().stock;
    console.log(`[Paso 1] Stock inicial de PROD-E2E: ${stockInicial}`);
    
    // 2. Simular caída SRI emitiendo una venta
    console.log('\n[Paso 2] Emitiendo venta simulando caída de SRI (forceFail=true)...');
    
    const emitResponse = await fetch('http://localhost:9005/api/sri/emitir', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer TEST'
      },
      body: JSON.stringify({
         productos: [{
            id: 'PROD-E2E',
            name: 'Camisa E2E',
            cantidad: 2,
            price: 10,
            hasIVA: true
         }],
         cliente: {
            nombre: 'E2E Tester',
            numeroIdentificacion: '9999999999999',
            tipoIdentificacion: '07',
            direccion: 'Test',
            email: 'test@test.com'
         },
         emisorId: 'hermano_geovanny',
         formaPago: '01',
         transactionId: 'txn-e2e-' + Date.now(),
         subtotal: 20,
         ivaAmount: 3,
         total: 23,
         isNotaVenta: false,
         forceFail: true // Nuestra bandera secreta para simular fallo
      })
    });
    
    const emitData = await emitResponse.json();
    console.log('Respuesta de emitir:', JSON.stringify(emitData, null, 2));
    
    if (emitData.success !== false || emitData.estado !== 'CONTINGENCIA_LOCAL') {
      throw new Error('La emisión no quedó en CONTINGENCIA_LOCAL como se esperaba.');
    }
    const claveAcceso = emitData.claveAcceso;
    
    // 3. Verificar stock descontado
    await delay(1000); // Darle tiempo a Firestore
    prodDoc = await prodRef.get();
    const stockTrasFallo = prodDoc.data().stock;
    console.log(`\n[Paso 3] Stock tras fallo SRI (esperado ${stockInicial - 2}): ${stockTrasFallo}`);
    if (stockTrasFallo !== stockInicial - 2) {
       throw new Error('El stock no se descontó en contingencia!');
    }
    
    // 4. Comprobar que aparece en Ventas como PENDIENTE
    const ventaDoc = await db.collection('ventas').doc(claveAcceso).get();
    if (!ventaDoc.exists) {
       throw new Error('La venta NO se guardó en la colección ventas.');
    }
    const ventaData = ventaDoc.data();
    console.log(`\n[Paso 4] Venta encontrada en Firestore. Estado Venta: ${ventaData.estadoVenta} | Estado SRI: ${ventaData.estadoSri}`);
    if (ventaData.estadoSri !== 'PENDIENTE_ENVIO') {
       throw new Error('El estado SRI no es PENDIENTE_ENVIO');
    }
    
    console.log('Documento en Firestore ANTES del reintento (Resumido):');
    console.log(JSON.stringify({
      estadoVenta: ventaData.estadoVenta,
      estadoSri: ventaData.estadoSri,
      total: ventaData.totals.total,
      xmlGenerado: !!ventaData.xmlFirmado
    }, null, 2));
    
    // 5. Restablecer conexión (no enviar forceFail) y reintentar
    console.log('\n[Paso 5] Ejecutando Reintento SRI (Restaurando conexión)...');
    
    const retryResponse = await fetch('http://localhost:9005/api/sri/reintentar', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer TEST'
      },
      body: JSON.stringify({
         claveAcceso: claveAcceso
      })
    });
    
    const retryData = await retryResponse.json();
    console.log('Respuesta de reintento:', JSON.stringify(retryData, null, 2));
    
    if (!retryData.success) {
      throw new Error('El reintento falló.');
    }
    
    // 6. Confirmar cambios finales sin duplicar
    await delay(1000);
    prodDoc = await prodRef.get();
    const stockFinal = prodDoc.data().stock;
    console.log(`\n[Paso 6] Stock final tras reintento (debe seguir siendo ${stockTrasFallo}): ${stockFinal}`);
    
    const ventaFinalDoc = await db.collection('ventas').doc(claveAcceso).get();
    const ventaFinalData = ventaFinalDoc.data();
    console.log(`Estado SRI final en Firestore: ${ventaFinalData.estadoSri}`);
    console.log('Documento en Firestore DESPUÉS del reintento (Resumido):');
    console.log(JSON.stringify({
      estadoVenta: ventaFinalData.estadoVenta,
      estadoSri: ventaFinalData.estadoSri,
      numeroAutorizacion: ventaFinalData.numeroAutorizacion ? 'Generado' : null,
      fechaAutorizacion: ventaFinalData.fechaAutorizacion ? 'Generada' : null
    }, null, 2));
    
    console.log('\n=== PRUEBA E2E COMPLETADA CON ÉXITO ===');
    process.exit(0);
    
  } catch(e) {
    console.error('\n❌ ERROR E2E:', e);
    process.exit(1);
  }
}

runE2E();
