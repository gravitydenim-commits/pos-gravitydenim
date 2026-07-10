const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

(async () => {
  try {
    const userSnap = await db.collection('users').doc('AHo5ztrPExZndYJPIr1aByebMsN2').get();
    console.log("User Data:", userSnap.data());
  } catch (error) {
    console.error("Error:", error);
  }
})();
