const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

(async () => {
  try {
    const roleSnap = await db.collection('roles').doc('P6obE0ER4frt0dlL87us').get();
    console.log("Role Data:", roleSnap.data());
  } catch (error) {
    console.error("Error:", error);
  }
})();
