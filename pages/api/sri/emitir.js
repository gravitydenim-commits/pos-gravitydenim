const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore, doc, runTransaction } = require('firebase/firestore');

let db;
try {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Init Error:", e);
}

// Generador de clave de acceso SRI
function generarClaveAcceso(fechaEmision, tipoComprobante, ruc, ambiente, estab, ptoEmi, secuencial, codigoNumerico, tipoEmision) {
  const fechaStr = fechaEmision.replace(/\//g, ''); // ddmmaaaa
  const estabStr = estab.padStart(3, '0');
  const ptoEmiStr = ptoEmi.padStart(3, '0');
  const secuencialStr = secuencial.toString().padStart(9, '0');
  
  let clave = `${fechaStr}${tipoComprobante}${ruc}${ambiente}${estabStr}${ptoEmiStr}${secuencialStr}${codigoNumerico}${tipoEmision}`;
  
  // Calcular dígito verificador Módulo 11
  let factor = 2;
  let suma = 0;
  for (let i = clave.length - 1; i >= 0; i--) {
    suma += parseInt(clave[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  let digito = 11 - (suma % 11);
  if (digito === 11) digito = 0;
  if (digito === 10) digito = 1;
  
  return clave + digito;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        message: 'Firebase no está inicializado en el servidor (faltan variables de entorno en Vercel).' 
      });
    }

    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { emisorId, customer, existingSecuencial } = data;

    if (!emisorId) {
      return res.status(400).json({ message: 'Falta el ID del emisor' });
    }

    const emisorRef = doc(db, 'issuers', emisorId);
    
    let secuencialAsignado = 0;
    let estabAsignado = "001";
    let ptoEmiAsignado = "001";
    let rucEmisor = emisorId;

    // Transacción atómica para reservar el secuencial
    await runTransaction(db, async (transaction) => {
      const emisorDoc = await transaction.get(emisorRef);
      if (!emisorDoc.exists()) {
        throw new Error("El emisor no existe en la base de datos.");
      }
      
      const emisorData = emisorDoc.data();
      estabAsignado = emisorData.estab || "001";
      ptoEmiAsignado = emisorData.ptoEmi || "001";
      rucEmisor = emisorData.ruc || emisorId;
      
      if (existingSecuencial) {
        // Es un reintento de contingencia, usamos el secuencial que ya tenía
        secuencialAsignado = parseInt(existingSecuencial, 10);
      } else {
        // Es una venta nueva, tomamos el secuencial actual y lo incrementamos
        secuencialAsignado = parseInt(emisorData.secuencial || 1, 10);
        transaction.update(emisorRef, { secuencial: secuencialAsignado + 1 });
      }
    });

    // Construir la Clave de Acceso
    const fechaActual = new Date();
    const d = String(fechaActual.getDate()).padStart(2, '0');
    const m = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const y = fechaActual.getFullYear();
    const fechaFmt = `${d}${m}${y}`;

    // Ambiente: 1 (Pruebas), Tipo Comprobante: 01 (Factura), Tipo Emisión: 1 (Normal)
    const ambiente = "1";
    const tipoComprobante = "01";
    const tipoEmision = "1";
    const codigoNumerico = "12345678";

    const claveAcceso = generarClaveAcceso(
      fechaFmt, 
      tipoComprobante, 
      rucEmisor.padEnd(13, '0'), 
      ambiente, 
      estabAsignado, 
      ptoEmiAsignado, 
      secuencialAsignado, 
      codigoNumerico, 
      tipoEmision
    );

    const numeroComprobante = `${estabAsignado}-${ptoEmiAsignado}-${String(secuencialAsignado).padStart(9, '0')}`;

    console.log(`🚀 [API SRI] Factura ${numeroComprobante} reservada. Clave: ${claveAcceso}`);

    // SIMULACIÓN DE CONEXIÓN AL SRI (Modo Pruebas / Contingencia)
    // Para blindar la legalidad y contingencia, simulamos un 10% de fallo (internet caído)
    const isNetworkFailing = Math.random() < 0.1;
    
    if (isNetworkFailing) {
      // Simula caída de internet
      console.log(`⚠️ [API SRI] Fallo de red simulado para factura ${numeroComprobante}. Guardar en contingencia.`);
      return res.status(503).json({ 
        success: false,
        estado: 'CONTINGENCIA_LOCAL',
        message: 'Fallo al conectar con el SRI (Simulado). Factura guardada en contingencia.', 
        claveAcceso: claveAcceso,
        numeroComprobante: numeroComprobante,
        secuencialAsignado: secuencialAsignado,
        ambiente: ambiente === "1" ? "PRUEBAS" : "PRODUCCION"
      });
    }

    // Respuesta Exitosa
    return res.status(200).json({ 
      success: true, 
      estado: 'AUTORIZADO', 
      claveAcceso: claveAcceso,
      numeroComprobante: numeroComprobante,
      secuencialAsignado: secuencialAsignado,
      ambiente: ambiente === "1" ? "PRUEBAS" : "PRODUCCION"
    });

  } catch (error) {
    console.error("❌ [API SRI] Error en emisión:", error);
    
    // Si la transacción falla totalmente
    return res.status(500).json({ 
      success: false,
      estado: 'RECHAZADO',
      message: 'Fallo fatal en el servidor local o base de datos', 
      error: error.message 
    });
  }
};
