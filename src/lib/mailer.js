const nodemailer = require('nodemailer');

async function sendInvoiceEmail({ customerEmail, pdfBuffer, xmlBuffer, claveAcceso, issuerName, numeroComprobante }) {
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const emailPass = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT || 465);

  console.log(`\n📧 [Mailer] Iniciando proceso de envío de correo...`);
  console.log(`📧 [Mailer] Destinatario: ${customerEmail}`);
  console.log(`📧 [Mailer] Comprobante: ${numeroComprobante || claveAcceso}`);
  console.log(`📧 [Mailer] Servidor SMTP: ${smtpHost}:${smtpPort}`);
  console.log(`📧 [Mailer] Usuario SMTP: ${emailUser || 'NO_CONFIGURADO'}`);

  if (!customerEmail || customerEmail === 'N/A' || customerEmail.trim() === '' || customerEmail.toLowerCase().includes('consumidorfinal')) {
    console.warn("⚠️ [Mailer] No se envió el correo: El cliente no tiene un email válido.");
    return { success: false, reason: 'NO_VALID_EMAIL', error: 'El cliente no tiene un correo electrónico válido registrado.' };
  }

  // Verificar credenciales válidas
  if (!emailUser || !emailPass || emailUser === 'tu_correo@gmail.com' || emailPass === 'password123') {
    const missingErr = `❌ [Mailer] Credenciales SMTP no configuradas o con valores por defecto (EMAIL_USER=${emailUser}).`;
    console.error(missingErr);
    return { success: false, reason: 'INVALID_CREDENTIALS', error: 'Credenciales SMTP (EMAIL_USER / EMAIL_APP_PASSWORD) no configuradas en las variables de entorno.' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: emailUser,
      pass: emailPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const attachments = [];

  if (pdfBuffer) {
    attachments.push({
      filename: `Factura_${numeroComprobante || claveAcceso}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  if (xmlBuffer) {
    attachments.push({
      filename: `Factura_${numeroComprobante || claveAcceso}.xml`,
      content: typeof xmlBuffer === 'string' ? Buffer.from(xmlBuffer, 'utf8') : xmlBuffer,
      contentType: 'application/xml'
    });
  }

  const mailOptions = {
    from: `"${issuerName || 'GRAVITY DENIM'}" <${emailUser}>`,
    to: customerEmail,
    subject: `Comprobante Electrónico Autorizado No. ${numeroComprobante || claveAcceso} - ${issuerName || 'GRAVITY DENIM'}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #e53e3e; margin-top: 0;">¡Gracias por su compra en ${issuerName || 'GRAVITY DENIM'}!</h2>
        <p>Estimado/a cliente,</p>
        <p>Adjuntamos a este correo su <strong>Factura Electrónica Autorizada</strong> en formato PDF (RIDE) y el archivo XML legal del SRI.</p>
        <div style="background: #f7fafc; padding: 12px; border-radius: 6px; margin: 15px 0;">
          <div><strong>Número de Comprobante:</strong> ${numeroComprobante || 'N/A'}</div>
          <div><strong>Clave de Acceso:</strong> ${claveAcceso}</div>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 11px; color: #718096;">Este es un correo automático generado por el Sistema POS de ${issuerName || 'GRAVITY DENIM'}. Por favor, no responda a este mensaje.</p>
      </div>
    `,
    attachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ [Mailer] Correo enviado exitosamente:", info.messageId, info.response);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error("❌ [Mailer] ERROR AL ENVIAR CORREO ELECTRÓNICO:");
    console.error(`❌ Mensaje: ${error.message}`);
    console.error(`❌ Código: ${error.code || error.responseCode || 'N/A'}`);
    console.error(`❌ Stack:\n${error.stack}`);
    return { 
      success: false, 
      error: error.message || String(error), 
      code: error.code || error.responseCode || null,
      stack: error.stack || null
    };
  }
}

module.exports = { sendInvoiceEmail };
