import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function testClientLookupFlow() {
  console.log("🧪 INICIANDO PRUEBA DE BÚSQUEDA Y GUARDADO DE CLIENTES POR IDENTIFICACIÓN");

  // 1. Probar RUC existente de prueba (Edgar Geovanny / emisor)
  const rucTest = '1803805405001';
  console.log(`\n1️⃣ Probando RUC: ${rucTest}`);
  
  // Guardar datos de prueba en la base de clientes Firestore
  const clientRef = db.collection('clientes').doc(rucTest);
  await clientRef.set({
    tipoDocumento: 'RUC',
    numeroIdentificacion: rucTest,
    nombre: 'EDGAR GEOVANNY SANCHEZ RAMIREZ',
    direccion: 'Av. Maldonado y Quimiag',
    correo: 'gravitydenim@gmail.com',
    telefono: '0995383604',
    fechaRegistro: new Date().toISOString(),
    origen: 'LOCAL_TEST'
  }, { merge: true });

  // Leer desde Firestore local
  const docSnap = await clientRef.get();
  if (docSnap.exists) {
    console.log("  ✅ Cliente recuperado exitosamente de Firestore 'clientes':", docSnap.data().nombre);
  } else {
    console.error("  ❌ Error guardando/leyendo cliente en Firestore");
  }

  // 2. Probar Cédula sin RUC (debe devolver el mensaje solicitado)
  const cedulaSinRuc = '1804632659';
  console.log(`\n2️⃣ Probando Cédula sin RUC registrado: ${cedulaSinRuc}`);
  
  // Simular la llamada a /api/sri/consulta-ruc
  const consultaHandler = (await import('../pages/api/sri/consulta-ruc.js')).default;
  let apiResult = null;

  await consultaHandler(
    { method: 'GET', query: { ruc: cedulaSinRuc } },
    {
      status: (code) => ({
        json: (data) => { apiResult = { code, ...data }; }
      })
    }
  );

  console.log("  📌 Respuesta Endpoint /api/sri/consulta-ruc:", apiResult);

  if (apiResult && apiResult.message === "No se encontraron datos públicos en el SRI. Ingrese el nombre manualmente") {
    console.log("  ✅ Mensaje requerido verificado correctamente.");
  } else {
    console.error("  ⚠️ El mensaje de la API difiere:", apiResult?.message);
  }
}

testClientLookupFlow().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
