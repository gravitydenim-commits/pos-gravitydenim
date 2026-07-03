const { getAdminDb } = require('./src/lib/firebaseAdmin');

async function checkVault() {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection('issuers_secrets').get();
    if (snapshot.empty) {
      console.log("VACIO: No hay firmas en issuers_secrets");
    } else {
      console.log(`HAY ${snapshot.size} FIRMAS EN LA BOVEDA:`);
      snapshot.forEach(doc => {
        console.log(`- Emisor: ${doc.id}`);
      });
    }
  } catch (error) {
    console.error("Error conectando a Firestore:", error);
  }
}

checkVault();
