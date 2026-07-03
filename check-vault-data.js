const { getAdminDb } = require('./src/lib/firebaseAdmin');

async function checkVaultData() {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection('issuers_secrets').get();
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`- Emisor: ${doc.id}`);
      console.log(`  - p12Base64 exists: ${!!data.p12Base64}`);
      console.log(`  - password exists: ${!!data.password}`);
      if (data.p12Base64) {
         console.log(`  - base64 length: ${data.p12Base64.length}`);
      }
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

checkVaultData();
