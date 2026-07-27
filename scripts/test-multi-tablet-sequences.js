import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function runMultiTabletSequenceTest() {
  console.log("🧪 INICIANDO PRUEBA DE SECUENCIAL MULTI-TABLET ATÓMICO EN FIRESTORE");

  // Tomar el emisor de prueba (Edgar Geovanny / hermano)
  const issuersSnap = await db.collection('issuers').get();
  if (issuersSnap.empty) {
    console.error("❌ No se encontraron emisores en la colección 'issuers'");
    process.exit(1);
  }

  const testIssuerDoc = issuersSnap.docs[0];
  const emisorId = testIssuerDoc.id;
  const emisorData = testIssuerDoc.data();
  console.log(`📌 Emisor de prueba: ${emisorData.name} (ID: ${emisorId})`);

  const estab = emisorData.estab || emisorData.establecimiento || '001';
  const ptoEmi = emisorData.ptoEmi || emisorData.puntoEmision || '001';
  const secKey = `${estab}_${ptoEmi}`;

  const currentSec = (emisorData.secuenciales || {})[secKey] || 0;
  console.log(`📊 Secuencial actual antes de la prueba concurrente: ${currentSec}`);

  // Simular 5 tablets facturando simultáneamente al mismo milisegundo
  const numTablets = 5;
  console.log(`⚡ Simulando ${numTablets} tablets emitiendo simultáneamente...`);

  const results = await Promise.all(
    Array.from({ length: numTablets }).map(async (_, idx) => {
      const tabletId = `Tablet-${idx + 1}`;
      try {
        const reservedSec = await db.runTransaction(async (t) => {
          const ref = db.collection('issuers').doc(emisorId);
          const doc = await t.get(ref);
          const data = doc.data() || {};
          const secuenciales = data.secuenciales || {};
          const current = secuenciales[secKey] || 0;
          const next = current + 1;
          t.update(ref, { [`secuenciales.${secKey}`]: next });
          return next;
        });

        console.log(`  - [${tabletId}] Secuencial reservado con éxito: ${reservedSec}`);
        return { tabletId, reservedSec, success: true };
      } catch (err) {
        console.error(`  - [${tabletId}] Error en transacción:`, err.message);
        return { tabletId, error: err.message, success: false };
      }
    })
  );

  // Verificar que todos hayan obtenido un número único e incremental
  const reservedNumbers = results.map(r => r.reservedSec).sort((a, b) => a - b);
  console.log("\n📋 Resultados de secuenciales asignados:", reservedNumbers);

  const uniqueSet = new Set(reservedNumbers);
  const hasDuplicates = uniqueSet.size !== reservedNumbers.length;

  const expectedFirst = currentSec + 1;
  const expectedLast = currentSec + numTablets;

  const isStrictIncrement = reservedNumbers[0] === expectedFirst && reservedNumbers[reservedNumbers.length - 1] === expectedLast;

  if (!hasDuplicates && isStrictIncrement) {
    console.log("✅ PRUEBA MULTI-TABLET EXITOSA:");
    console.log(`  - Duplicados: NO (0 duplicados)`);
    console.log(`  - Rango asignado: ${expectedFirst} -> ${expectedLast}`);
    console.log(`  - Transacciones atómicas garantizadas sin race conditions.`);
  } else {
    console.error("❌ FALLÓ LA PRUEBA DE SECUENCIALES:");
    console.error(`  - Duplicados detectados: ${hasDuplicates ? 'SÍ' : 'NO'}`);
    console.error(`  - Secuencia esperada: ${expectedFirst} -> ${expectedLast}`);
  }
}

runMultiTabletSequenceTest().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
