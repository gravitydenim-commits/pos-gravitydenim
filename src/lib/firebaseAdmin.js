import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// 1. Inicializar la aplicación solo si no existe
if (!getApps().length) {
  try {
    const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
    let credential;

    if (fs.existsSync(serviceAccountPath)) {
      // 1. Usar el archivo JSON local (Desarrollo)
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      credential = cert(serviceAccount);
      console.log('Firebase Admin: Inicializado con serviceAccountKey.json');
    } else {
      // 2. Fallback a variables de entorno (Producción/Vercel)
      credential = cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      });
      console.log('Firebase Admin: Inicializado con Variables de Entorno');
    }

    initializeApp({
      credential
    });
  } catch (error) {
    console.error('Firebase admin initialization error:', error.message);
  }
}

// 2. Exportar funciones que devuelven los servicios instanciados
export function getAdminAuth() {
  return getAuth();
}

export function getAdminDb() {
  return getFirestore();
}
