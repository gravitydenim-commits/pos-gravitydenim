const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

(async () => {
  try {
    const users = await db.collection('users').get();
    for (const doc of users.docs) {
      const data = doc.data();
      if (data.customPermissions === undefined) {
        await doc.ref.update({ customPermissions: null });
        console.log(`Updated user ${doc.id} with customPermissions: null`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
})();
