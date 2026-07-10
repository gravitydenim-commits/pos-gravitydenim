const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function check() {
  const userSnap = await db.collection('users').doc('9VHIhKzvkaU5oHgy4l6oXpzPtEc2').get();
  console.log('User roleId:', userSnap.data().roleId);
  const roleSnap = await db.collection('roles').doc(userSnap.data().roleId).get();
  console.log('Role name:', roleSnap.data().name);
  console.log('Role permissions:', JSON.stringify(roleSnap.data().permissions, null, 2));
}
check().catch(console.error);
