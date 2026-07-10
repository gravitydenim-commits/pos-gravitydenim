export const imprimirTicket = (issuerData, cartData, totalsData, customerData, claveAcceso, paymentMethod, transferRecipient, isNotaVenta, format = '80mm') => {
  console.log(`🖨️ Conectando con ticketera térmica formato ${format}...`);
  const is58 = format === '58mm';
  
  // Para 58mm ajustamos la ventana a algo más angosto
  const winWidth = is58 ? 300 : 400;
  const printWindow = window.open('', '_blank', `width=${winWidth},height=600`);
  
  if (!printWindow) {
    alert("Por favor, permite las ventanas emergentes (pop-ups) para imprimir el ticket.");
    return;
  }

  // Generar las filas de productos
  const productosHTML = cartData.map(item => `
    <tr>
      <td style="padding: 2px 0; vertical-align: top;">${item.qty}</td>
      <td style="padding: 2px 4px; vertical-align: top; word-break: break-word;">${item.name}</td>
      <td style="padding: 2px 0; text-align: right; vertical-align: top;">$${(item.price * item.qty).toFixed(2)}</td>
    </tr>
  `).join('');

  // Estilos adaptados al formato
  const containerWidth = is58 ? '48mm' : '72mm'; // 58mm de papel usualmente tiene 48mm imprimibles
  const fontSize = is58 ? '10px' : '12px';
  const logoWidth = is58 ? '90px' : '120px';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${isNotaVenta ? 'Nota de Venta' : 'Ticket RIDE'} - ${claveAcceso}</title>
      <style>
        @page { 
          margin: 0; 
          size: ${is58 ? '58mm auto' : '80mm auto'};
        }
        body { 
          font-family: monospace; 
          font-size: ${fontSize}; 
          margin: 0; 
          padding: ${is58 ? '2px' : '10px'}; 
          background: white; 
          color: black;
          width: ${is58 ? '58mm' : '100%'};
        }
        @media print {
          body { padding: 0; background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .ticket-container { 
          width: ${containerWidth}; 
          margin: 0 auto; 
          overflow: hidden;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .mt-2 { margin-top: ${is58 ? '4px' : '8px'}; }
        .mb-2 { margin-bottom: ${is58 ? '4px' : '8px'}; }
        .divider { border-top: 1px dashed black; margin: ${is58 ? '4px' : '8px'} 0; }
        .solid-divider { border-top: 1px solid black; margin: ${is58 ? '4px' : '8px'} 0; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { border-bottom: 1px solid black; padding-bottom: 2px; text-align: left; }
        th:nth-child(1) { width: 15%; }
        th:nth-child(2) { width: 60%; }
        th:nth-child(3) { width: 25%; text-align: right; }
      </style>
    </head>
    <body>
      <div class="ticket-container">
        <div class="text-center mb-2">
          <img src="/logo.jpg" alt="Logo" style="width: ${logoWidth}; margin-bottom: 5px; filter: grayscale(100%);" onerror="this.style.display='none'" />
          <h2 style="margin:0; font-size: ${is58 ? '12px' : '16px'};">${issuerData?.name?.toUpperCase() || ''}</h2>
          <div class="mt-2">RUC: ${issuerData?.ruc || ''}</div>
          <div>DIR: ${issuerData?.direccionMatriz || 'N/A'}</div>
          <div>OBLIGADO CONTABILIDAD: ${issuerData?.obligadoContabilidad ? 'SI' : 'NO'}</div>
          <div class="font-bold mt-2">GRAVITY DENIM POS</div>
          ${isNotaVenta ? `<div style="margin-top: 5px; border: 1px dashed black; padding: 2px;"><div class="font-bold" style="font-size: ${is58 ? '11px' : '14px'};">NOTA DE VENTA</div><div class="font-bold" style="font-size: ${is58 ? '9px' : '12px'}; margin-top: 2px;">SIN VALIDEZ TRIBUTARIA</div></div>` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div>
          <div><b>CLIENTE:</b> ${customerData?.nombre || ''}</div>
          <div><b>CI/RUC:</b> ${customerData?.numeroIdentificacion || ''}</div>
          <div><b>CORREO:</b> ${customerData?.correo || ''}</div>
          <div><b>DIR:</b> ${customerData?.direccion || ''}</div>
        </div>
        
        <div class="divider"></div>
        
        <table>
          <thead>
            <tr>
              <th>CANT</th>
              <th>DESCRIPCIÓN</th>
              <th class="text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${productosHTML}
          </tbody>
        </table>
        
        <div class="solid-divider"></div>
        
        <table style="margin-left: auto; width: 100%;">
          <tr>
            <td class="text-right">SUBTOTAL:</td>
            <td class="text-right">$${totalsData?.subtotal?.toFixed(2) || '0.00'}</td>
          </tr>
          ${!isNotaVenta ? `
          <tr>
            <td class="text-right">BASE 15%:</td>
            <td class="text-right">$${totalsData?.baseImponible?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr>
            <td class="text-right">IVA 15%:</td>
            <td class="text-right">$${totalsData?.ivaAmount?.toFixed(2) || '0.00'}</td>
          </tr>
          ` : ''}
          <tr>
            <td class="text-right font-bold" style="font-size: ${is58 ? '12px' : '16px'};">TOTAL:</td>
            <td class="text-right font-bold" style="font-size: ${is58 ? '12px' : '16px'};">$${totalsData?.total?.toFixed(2) || '0.00'}</td>
          </tr>
        </table>
        
        <div class="divider"></div>
        
        <div>
          <div><b>FORMA DE PAGO:</b> ${paymentMethod}</div>
          ${paymentMethod === 'TRANSFERENCIA' && transferRecipient ? `<div><b>DESTINATARIO:</b> ${transferRecipient}</div>` : ''}
        </div>

        <div class="divider"></div>
        
        <div class="text-center mt-2" style="font-size: ${is58 ? '9px' : '11px'};">
          ${isNotaVenta ? `<div style="margin: 8px 0; border: 1px solid black; padding: 4px;"><p style="margin: 0; font-weight: bold; font-size: ${is58 ? '10px' : '12px'};">DOCUMENTO SIN VALIDEZ TRIBUTARIA</p><p style="margin: 2px 0 0 0; font-size: ${is58 ? '8px' : '10px'};">NO VÁLIDO PARA EL SRI</p></div>` : ''}
          <p style="margin: 2px 0;">${isNotaVenta ? 'Ref Interna:' : 'Clave de Acceso:'}</p>
          <p style="margin: 2px 0; word-break: break-all;">${claveAcceso}</p>
          <p style="margin: 10px 0 0 0;">¡Gracias por su compra!</p>
          <p style="margin: 2px 0;">Desarrollado por anitygravity.com</p>
        </div>
        
        <div style="height: 30px;"></div> <!-- Espacio para el corte de papel -->
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 500);
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};
