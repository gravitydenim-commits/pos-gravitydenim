import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

process.env.TZ = 'America/Guayaquil';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function createBackup() {
  console.log("==================================================");
  console.log("📦 GENERANDO COPIA DE SEGURIDAD COMPLETA...");
  console.log("==================================================");

  const collectionsToBackup = ['ventas', 'products', 'productos', 'customers', 'clientes', 'sri_logs', 'issuers', 'settings', 'secuenciales'];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const backupData = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    environment: process.env.SRI_ENVIRONMENT || 'production',
    summary: {},
    data: {}
  };

  const backupsDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  for (const collName of collectionsToBackup) {
    try {
      const snap = await db.collection(collName).get();
      backupData.data[collName] = [];
      snap.forEach(doc => {
        backupData.data[collName].push({ id: doc.id, ...doc.data() });
      });
      backupData.summary[collName] = backupData.data[collName].length;
      console.log(`  - Colección '${collName}': ${backupData.summary[collName]} documentos respaldados.`);
    } catch (e) {
      console.warn(`  - Colección '${collName}': No encontrada o vacía (${e.message}).`);
    }
  }

  const fileName = `backup_completo_${timestamp}.json`;
  const filePath = path.join(backupsDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

  console.log("\n==================================================");
  console.log(`✅ RESUMEN DE COPIA DE SEGURIDAD:`);
  console.log(`• Archivo: ${filePath}`);
  console.log(`• Tamaño: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
  console.log(`• Facturas y Ventas: ${backupData.summary['ventas'] || 0}`);
  console.log(`• Productos: ${backupData.summary['productos'] || backupData.summary['products'] || 0}`);
  console.log(`• Clientes: ${backupData.summary['customers'] || backupData.summary['clientes'] || 0}`);
  console.log(`• Emisores / Certificados: ${backupData.summary['issuers'] || 0}`);
  console.log(`• SRI Logs: ${backupData.summary['sri_logs'] || 0}`);
  console.log("==================================================");
}

createBackup().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
