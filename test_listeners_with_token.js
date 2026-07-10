const { initializeApp: initAdmin, cert } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const serviceAccount = require('./serviceAccountKey.json');

const { initializeApp: initClient } = require('firebase/app');
const { getFirestore, collection, onSnapshot } = require('firebase/firestore');
const { getAuth, signInWithCustomToken } = require('firebase/auth');

initAdmin({ credential: cert(serviceAccount) });

const firebaseConfig = {
  apiKey: "AIzaSyCaLpC-jUXG-N_yyNPm6NAepPVzCmqNtZo",
  authDomain: "gravitydenimpos.firebaseapp.com",
  projectId: "gravitydenimpos"
};

const app = initClient(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

(async () => {
  try {
    const customToken = await getAdminAuth().createCustomToken('AHo5ztrPExZndYJPIr1aByebMsN2');
    await signInWithCustomToken(auth, customToken);
    console.log("Signed in successfully via custom token");

    const tests = ['clientes', 'productos', 'ventas', 'issuers', 'roles'];
    
    for (const coll of tests) {
      const unsub = onSnapshot(collection(db, coll), 
        (snap) => {
          console.log(`[${coll}] SUCCESS: Read ${snap.size} docs`);
          unsub();
        },
        (err) => {
          console.error(`[${coll}] ERROR:`, err.message);
        }
      );
    }
  } catch (error) {
    console.error("Setup error:", error);
  }
})();
