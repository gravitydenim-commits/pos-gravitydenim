import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function regenerateEdgarPdf() {
  console.log("🔍 Buscando facturas autorizadas de Edgar en la colección 'ventas'...");

  // Buscar ventas de Edgar
  const snap = await db.collection('ventas').get();
  let edgarInvoices = [];

  snap.docs.forEach(doc => {
    const data = doc.data();
    const isEdgar = (data.emisorId === 'hermano_geovanny' || data.emisorId === 'edgar_sanchez' || 
                     (data.xmlFirmado && data.xmlFirmado.includes('1803805405001')) ||
                     (data.infoTributaria && data.infoTributaria.ruc === '1803805405001'));
    
    if (isEdgar) {
      edgarInvoices.push({ id: doc.id, ...data });
    }
  });

  console.log(`📌 Se encontraron ${edgarInvoices.length} facturas de Edgar Sánchez.`);

  const generateRidePdf = require('../src/lib/pdfGenerator').generateRidePdf;
  const sendInvoiceEmail = require('../src/lib/mailer').sendInvoiceEmail;

  for (const inv of edgarInvoices) {
    const claveAcceso = inv.claveAcceso || inv.id;
    console.log(`\n📄 Procesando Factura Edgar: ${inv.numeroComprobante || claveAcceso}`);
    console.log(`  - Estado SRI: ${inv.estadoSri || inv.status}`);
    console.log(`  - Clave de Acceso: ${claveAcceso}`);

    // Cargar emisor Edgar de Firestore
    const issuerSnap = await db.collection('issuers').doc(inv.emisorId || 'hermano_geovanny').get();
    const issuerData = issuerSnap.exists ? issuerSnap.data() : {
      name: 'Edgar Geovanny Sanchez Ramirez',
      ruc: '1803805405001',
      direccionMatriz: 'Av. Maldonado y Quimiag',
      obligadoContabilidad: false,
      establecimiento: '001',
      puntoEmision: '001'
    };

    // Preparar cliente e items
    const customer = inv.cliente || inv.customer || { nombre: 'Cliente', numeroIdentificacion: '9999999999999' };
    const cart = inv.items || inv.productos || [];
    const totalsData = inv.totals || { subtotal: inv.subtotal || 0, baseImponible: inv.subtotal || 0, ivaAmount: inv.ivaAmount || 0, total: inv.total || 0 };
    const fechaAuth = inv.fechaAutorizacion ? new Date(inv.fechaAutorizacion) : new Date();

    console.log("  ⚡ Regenerando PDF RIDE con Código de Barras Code 128 y Ambiente Real...");
    const pdfBuffer = await generateRidePdf({
      issuerData,
      customer,
      cart,
      totalsData,
      claveAcceso,
      numeroComprobante: inv.numeroComprobante || `001-001-${inv.secuencial || '000000001'}`,
      fecha: fechaAuth
    });

    console.log(`  ✅ PDF RIDE generado con éxito (${pdfBuffer.length} bytes).`);

    // Reenviar correo si el cliente tiene email
    const recipientEmail = customer.correo || inv.clienteEmail || inv.email;
    if (recipientEmail && recipientEmail !== 'N/A' && recipientEmail.includes('@')) {
      console.log(`  📧 Reenviando PDF actualizado a: ${recipientEmail}...`);
      try {
        const mailRes = await sendInvoiceEmail({
          to: recipientEmail,
          customerName: customer.nombre,
          invoiceNumber: inv.numeroComprobante || claveAcceso,
          claveAcceso: claveAcceso,
          pdfBuffer: pdfBuffer,
          xmlContent: inv.xmlAutorizado || inv.xmlFirmado || ''
        });

        console.log(`  ✅ Correo enviado exitosamente (Message ID: ${mailRes.messageId || 'OK'}).`);

        // Actualizar Firestore sin modificar inventario ni secuencial
        await db.collection('ventas').doc(inv.id).update({
          estadoEmail: 'ENVIADO',
          emailStatus: 'ENVIADO',
          emailReenviadoEn: new Date().toISOString()
        });

      } catch (errMail) {
        console.error(`  ❌ Error enviando correo:`, errMail.message);
        await db.collection('ventas').doc(inv.id).update({
          estadoEmail: 'ERROR_ENVIO',
          emailError: errMail.message
        });
      }
    } else {
      console.log("  ℹ️ Sin correo válido para envío. PDF RIDE regenerado exitosamente.");
    }
  }

  console.log("\n✨ Regeneración de PDF/RIDE de Edgar completada sin modificar numeración, inventario ni secuenciales.");
}

regenerateEdgarPdf().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
