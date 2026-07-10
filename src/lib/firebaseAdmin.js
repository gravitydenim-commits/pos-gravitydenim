import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Inicializar la aplicación solo si no existe
if (!getApps().length) {
  try {
    let credential;

    // Verificar si estamos en Vercel (o si existe la variable de entorno)
    if (process.env.FIREBASE_PRIVATE_KEY) {
      // Producción / Vercel
      credential = cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
      console.log('Firebase Admin: Inicializado con Variables de Entorno');
    } else {
      // Desarrollo local (requerirá que pongas un path directo o uses require si quieres)
      // Como no queremos que Next.js trace esto y falle en Vercel, lo importaremos dinámicamente o ignoraremos fs
      console.log('Firebase Admin: Usando credenciales por defecto (solo funciona si GOOGLE_APPLICATION_CREDENTIALS está seteado)');
      credential = undefined; // Esto hará que intente usar las credenciales por defecto del sistema
    }

    initializeApp(credential ? { credential } : undefined);
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
