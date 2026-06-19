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
const { getFirestore, doc, getDoc } = __turbopack_context__.r("[externals]/firebase/firestore [external] (firebase/firestore, cjs, [project]/node_modules/firebase)");
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
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Método no permitido'
        });
    }
    try {
        const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { emisorId, customer } = data;
        if (!emisorId || !customer?.numeroIdentificacion) {
            return res.status(400).json({
                message: 'Faltan datos del emisor o del cliente'
            });
        }
        const emisorRef = doc(db, 'emisores', emisorId);
        const emisorSnap = await getDoc(emisorRef);
        let issuerData = emisorSnap.exists() ? emisorSnap.data() : {
            ruc: emisorId
        };
        // OFFLINE BYPASS TOTAL
        // No conectamos al SRI. Generamos datos ficticios al instante para que la caja funcione localmente.
        const internalId = Math.floor(Math.random() * 1000000).toString().padStart(9, '0');
        const fakeClaveAcceso = `OFFLINE-${Date.now()}-${internalId}`;
        console.log(`🚀 [API SRI OFFLINE] Venta local registrada al instante para: ${issuerData.ruc}`);
        return res.status(200).json({
            success: true,
            estado: 'RECIBIDA (MODO OFFLINE)',
            claveAcceso: fakeClaveAcceso,
            numeroComprobante: `001-001-${internalId}`,
            ambiente: "LOCAL"
        });
    } catch (error) {
        console.error("❌ [API SRI OFFLINE] Error interno:", error);
        return res.status(500).json({
            message: 'Error interno del servidor',
            error: error.message
        });
    }
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0o1r_hm._.js.map