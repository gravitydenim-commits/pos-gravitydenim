const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

async function sendInvoiceEmail(customerEmail, pdfBuffer, xmlBuffer, claveAcceso, issuerName) {
  if (!customerEmail || customerEmail === 'N/A') {
    console.warn("⚠️ [Mailer] No se envió el correo. El cliente no tiene un email válido.");
    return false;
  }

  const mailOptions = {
    from: `"${issuerName}" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: `Su Comprobante Electrónico Autorizado - ${issuerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
        <h2 style="color: #e53e3e;">¡Gracias por su compra!</h2>
        <p>Estimado/a cliente,</p>
        <p>Adjuntamos a este correo su <strong>Factura Electrónica</strong> (formato PDF) y el archivo original autorizado por el SRI (formato XML).</p>
        <p><strong>Clave de Acceso:</strong> ${claveAcceso}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Este es un mensaje automático generado por el Sistema de Facturación de ${issuerName}. Por favor, no responda a este correo.</p>
      </div>
    `,
    attachments: [
      {
        filename: `${claveAcceso}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      },
      {
        filename: `${claveAcceso}.xml`,
        content: xmlBuffer,
        contentType: 'application/xml'
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("📧 [Mailer] Correo enviado exitosamente:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ [Mailer] Error enviando correo:", error);
    return false;
  }
}

module.exports = { sendInvoiceEmail };
