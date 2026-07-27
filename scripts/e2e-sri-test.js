process.env.SRI_ENVIRONMENT = 'production';
process.env.TZ = 'America/Guayaquil';

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'serviceAccountKey.json'), 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function runE2ETest() {
  console.log("==================================================");
  console.log("🚀 PRUEBA DE EXTREMO A EXTREMO (E2E) - SRI PRODUCCIÓN");
  console.log("==================================================");
  console.log("SRI_ENVIRONMENT:", process.env.SRI_ENVIRONMENT);
  console.log("TZ:", process.env.TZ);

  // 1. Obtener token de autenticación de admin y canjearlo por un ID Token real
  const customToken = await admin.auth().createCustomToken('AHo5ztrPExZndYJPIr1aByebMsN2');
  
  const apiKey = "AIzaSyCaLpC-jUXG-N_yyNPm6NAepPVzCmqNtZo";
  const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  
  const authData = await authRes.json();
  if (!authData.idToken) {
    throw new Error("No se pudo obtener idToken de Firebase REST API: " + JSON.stringify(authData));
  }

  const idToken = authData.idToken;
  console.log("✅ ID Token real obtenido para Admin.");

  // 2. Cargar emisor de prueba
  const db = admin.firestore();
  const emisorDoc = await db.collection('issuers').doc('hermano_geovanny').get();
  if (!emisorDoc.exists) {
    throw new Error("Emisor hermano_geovanny no encontrado.");
  }
  const emisor = emisorDoc.data();
  console.log(`✅ Emisor: ${emisor.name} (RUC: ${emisor.ruc})`);
  console.log(`   Establecimiento: ${emisor.estab || '001'}, Punto Emisión: ${emisor.ptoEmi || '001'}`);

  // 3. Simular llamada a handler de emitir.js
  const handler = require('../pages/api/sri/emitir.js').default;

  const mockReq = {
    method: 'POST',
    headers: {
      authorization: `Bearer ${idToken}`
    },
    body: {
      transactionId: `E2E-REAL-TEST-${Date.now()}`,
      emisorId: 'hermano_geovanny',
      cliente: {
        tipoDocumento: 'CONSUMIDOR_FINAL',
        nombre: 'CONSUMIDOR FINAL',
        numeroIdentificacion: '9999999999999',
        direccion: 'AMBATO',
        correo: 'facturas@gravitydenim.com',
        telefono: '0999999999'
      },
      productos: [
        {
          id: 'TEST_PROD_1',
          nombre: 'JEAN RECTO 3D PRUEBA E2E',
          qty: 1,
          price: 10.00,
          descuento: 0
        }
      ],
      formaPago: '01',
      isNotaVenta: false
    }
  };

  let resStatus = 200;
  let resJson = null;

  const mockRes = {
    status: function(code) {
      resStatus = code;
      return this;
    },
    json: function(data) {
      resJson = data;
      return this;
    }
  };

  console.log("\n🚀 Enviando Factura a /api/sri/emitir (Conexión real con SRI Producción)...");
  await handler(mockReq, mockRes);

  console.log("\n==================================================");
  console.log(`RESULTADO HTTP STATUS: ${resStatus}`);
  console.log("RESPUESTA RECIBIDA DE LA API:");
  console.log(JSON.stringify(resJson, null, 2));
  console.log("==================================================");

  if (resJson && resJson.claveAcceso) {
    const claveAcceso = resJson.claveAcceso;
    console.log(`\nVerificando registro en Firestore para claveAcceso: ${claveAcceso}`);
    const ventaDoc = await db.collection('ventas').doc(claveAcceso).get();
    if (ventaDoc.exists) {
      const vData = ventaDoc.data();
      console.log("✅ Venta registrada en Firestore:");
      console.log(`  - estadoSri: ${vData.estadoSri}`);
      console.log(`  - numeroComprobante: ${vData.numeroComprobante}`);
      console.log(`  - numeroAutorizacion: ${vData.numeroAutorizacion || 'N/A'}`);
      console.log(`  - fechaAutorizacion: ${vData.fechaAutorizacion || 'N/A'}`);
      console.log(`  - errorTecnico: ${vData.errorTecnico || 'Ninguno'}`);
      console.log(`  - mensajesSri: ${JSON.stringify(vData.mensajesSri || [])}`);
    } else {
      console.error("❌ Documento de venta no encontrado en Firestore.");
    }
  }

  process.exit(0);
}

runE2ETest().catch(err => {
  console.error("❌ Error en prueba E2E:", err);
  process.exit(1);
});
