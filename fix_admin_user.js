const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

(async () => {
  try {
    await db.collection('users').doc('AHo5ztrPExZndYJPIr1aByebMsN2').update({
      customPermissions: null
    });
    console.log("Updated user document with customPermissions: null");
  } catch (error) {
    console.error("Error:", error);
  }
})();
