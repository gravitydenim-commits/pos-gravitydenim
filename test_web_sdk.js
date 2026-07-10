const { initializeApp } = require('firebase/app');
const { getFirestore, onSnapshot, collection, doc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCaLpC-jUXG-N_yyNPm6NAepPVzCmqNtZo",
  authDomain: "gravitydenimpos.firebaseapp.com",
  projectId: "gravitydenimpos",
  storageBucket: "gravitydenimpos.firebasestorage.app",
  messagingSenderId: "676246680362",
  appId: "1:676246680362:web:042da84e5ecddadcd2e453"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

(async () => {
  try {
    console.log("Signing in...");
    await signInWithEmailAndPassword(auth, "gravitydenim@gmail.com", "tupassword123"); // I don't know the password!
  } catch (error) {
    console.error("Auth error:", error.message);
  }
})();
