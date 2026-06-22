module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/pages/api/sri/emitir.js [api] (ecmascript)", ((__turbopack_context__, module, exports) => {

const { initializeApp, getApps, getApp } = __turbopack_context__.r("[externals]/firebase/app [external] (firebase/app, cjs, [project]/node_modules/firebase)");
const { getFirestore, doc, runTransaction } = __turbopack_context__.r("[externals]/firebase/firestore [external] (firebase/firestore, cjs, [project]/node_modules/firebase)");
const firebaseConfig = {
    apiKey: ("TURBOPACK compile-time value", "AIzaSyCaLpC-jUXG-N_yyNPm6NAepPVzCmqNtZo"),
    authDomain: ("TURBOPACK compile-time value", "gravitydenimpos.firebaseapp.com"),
    projectId: ("TURBOPACK compile-time value", "gravitydenimpos"),
    storageBucket: ("TURBOPACK compile-time value", "gravitydenimpos.firebasestorage.app"),
    messagingSenderId: ("TURBOPACK compile-time value", "676246680362"),
    appId: ("TURBOPACK compile-time value", "1:676246680362:web:042da84e5ecddadcd2e453")
};
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
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
    for(let i = clave.length - 1; i >= 0; i--){
        suma += parseInt(clave[i]) * factor;
        factor = factor === 7 ? 2 : factor + 1;
    }
    let digito = 11 - suma % 11;
    if (digito === 11) digito = 0;
    if (digito === 10) digito = 1;
    return clave + digito;
}
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Método no permitido'
        });
    }
    try {
        const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { emisorId, customer, existingSecuencial } = data;
        if (!emisorId) {
            return res.status(400).json({
                message: 'Falta el ID del emisor'
            });
        }
        const emisorRef = doc(db, 'issuers', emisorId);
        let secuencialAsignado = 0;
        let estabAsignado = "001";
        let ptoEmiAsignado = "001";
        let rucEmisor = emisorId;
        // Transacción atómica para reservar el secuencial
        await runTransaction(db, async (transaction)=>{
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
                transaction.update(emisorRef, {
                    secuencial: secuencialAsignado + 1
                });
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
        const claveAcceso = generarClaveAcceso(fechaFmt, tipoComprobante, rucEmisor.padEnd(13, '0'), ambiente, estabAsignado, ptoEmiAsignado, secuencialAsignado, codigoNumerico, tipoEmision);
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
                ambiente: ("TURBOPACK compile-time truthy", 1) ? "PRUEBAS" : "TURBOPACK unreachable"
            });
        }
        // Respuesta Exitosa
        return res.status(200).json({
            success: true,
            estado: 'AUTORIZADO',
            claveAcceso: claveAcceso,
            numeroComprobante: numeroComprobante,
            secuencialAsignado: secuencialAsignado,
            ambiente: ("TURBOPACK compile-time truthy", 1) ? "PRUEBAS" : "TURBOPACK unreachable"
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
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0o1r_hm._.js.map