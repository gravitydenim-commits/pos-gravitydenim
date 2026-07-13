import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Inicializar la aplicación solo si no existe
if (!getApps().length) {
  try {
    let credential;

    const missing = [];
    if (!process.env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
    if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!process.env.FIREBASE_PRIVATE_KEY) missing.push('FIREBASE_PRIVATE_KEY');

    // 1. Intentar cargar desde variables de entorno
    if (missing.length === 0) {
      credential = cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
      console.log('Firebase Admin: Inicializado con Variables de Entorno');
    } else {
      // 2. Intentar cargar desde archivo local en desarrollo
      try {
        const fs = eval('require("fs")');
        const path = eval('require("path")');
        const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
        
        if (fs.existsSync(serviceAccountPath)) {
          const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
          credential = cert(serviceAccount);
          console.log('Firebase Admin: Inicializado con serviceAccountKey.json local');
        }
      } catch (err) {
        console.log('Firebase Admin: No se pudo cargar el archivo local.');
      }
    }

    if (!credential) {
      const detailMsg = missing.length > 0 
        ? `Faltan las siguientes variables de entorno en Vercel: ${missing.join(', ')}`
        : 'Falta configurar las credenciales de Firebase Admin o el archivo serviceAccountKey.json local.';
      throw new Error(
        `${detailMsg}. Para evitar llamadas fallidas al Metadata Server de Google Cloud, la inicialización ha sido detenida.`
      );
    }

    initializeApp({ credential });
  } catch (error) {
    console.error('Firebase admin initialization error:', error.message);
    throw error;
  }
}

// 2. Exportar funciones que devuelven los servicios instanciados
export function getAdminAuth() {
  return getAuth();
}

export function getAdminDb() {
  return getFirestore();
}
