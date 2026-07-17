export const imprimirTicket = (issuerData, cartData, totalsData, customerData, claveAcceso, paymentMethod, transferRecipient, isNotaVenta, format = '80mm', isReprint = false) => {
  console.log(`🖨️ Conectando con ticketera térmica formato ${format}...`);
  const is58 = format === '58mm';
  
  // Para 58mm ajustamos la ventana a algo más angosto
  const winWidth = is58 ? 300 : 400;
  const printWindow = window.open('', '_blank', `width=${winWidth},height=600`);
  
  if (!printWindow) {
    alert("Por favor, permite las ventanas emergentes (pop-ups) para imprimir el ticket.");
    return;
  }

    let base15 = 0;
    let base0 = 0;
    let totalDescuentos = 0;
    cartData.forEach(item => {
      const qty = item.qty || item.cantidad || 1;
      const price = item.price || item.precio || 0;
      const desc = item.descuento || 0;
      const hasIva = item.hasIVA !== false;
      totalDescuentos += desc;
      if (hasIva) {
        base15 += (price * qty) - desc;
      } else {
        base0 += (price * qty) - desc;
      }
    });

    const isNotaVentaActual = !!isNotaVenta;

    // Filas de productos con formato compacto
    const productosHTML = cartData.map(item => {
      const qty = item.qty || item.cantidad || 1;
      const price = item.price || item.precio || 0;
      const desc = item.descuento || 0;
      const totalItem = (price * qty) - desc;
      return `
        <tr>
          <td style="padding: 2px 0; vertical-align: top;">${qty}</td>
          <td style="padding: 2px 4px; vertical-align: top; word-break: break-word;">
            ${item.name || item.nombre}
            ${desc > 0 ? `<br/><small style="color: #666; font-size: 8px;">Desc: -$${Number(desc).toFixed(2)}</small>` : ''}
          </td>
          <td style="padding: 2px 0; text-align: right; vertical-align: top;">$${Number(price).toFixed(2)}</td>
          <td style="padding: 2px 0; text-align: right; vertical-align: top;">$${totalItem.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    // Estilos adaptados al formato
    const containerWidth = is58 ? '48mm' : '72mm';
    const fontSize = is58 ? '10px' : '12px';
    const logoWidth = is58 ? '90px' : '120px';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${isNotaVentaActual ? 'Nota de Venta' : 'Factura Electrónica'} - ${claveAcceso}</title>
        <style>
          @page { 
            margin: 0; 
            size: ${is58 ? '58mm auto' : '80mm auto'};
            size: portrait;
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
          th:nth-child(1) { width: 12%; }
          th:nth-child(2) { width: 44%; }
          th:nth-child(3) { width: 22%; text-align: right; }
          th:nth-child(4) { width: 22%; text-align: right; }
        </style>
      </head>
      <body>
        <div class="ticket-container">
          ${isReprint ? `<div style="border: 2px solid black; padding: 4px; font-weight: bold; font-size: ${is58 ? '11px' : '14px'}; margin-bottom: 10px; text-align: center; font-family: monospace;">*** REIMPRESIÓN ***</div>` : ''}
          <div class="text-center mb-2">
            <img src="/logo.jpg" alt="Logo" style="width: ${logoWidth}; margin-bottom: 5px; filter: grayscale(100%);" onerror="this.style.display='none'" />
            
            <!-- Datos del Emisor -->
            <h2 style="margin:0; font-size: ${is58 ? '12px' : '16px'};">${isNotaVentaActual ? 'GRAVITY DENIM' : (issuerData?.razonSocial || issuerData?.name || '')}</h2>
            ${!isNotaVentaActual && issuerData?.nombreComercial ? `<div style="font-size: ${is58 ? '9px' : '11px'}; font-style: italic;">${issuerData.nombreComercial}</div>` : ''}
            <div class="mt-2">RUC: ${issuerData?.ruc || ''}</div>
            <div>Matriz: ${issuerData?.direccionMatriz || 'N/A'}</div>
            ${!isNotaVentaActual && issuerData?.direccionEstablecimiento && issuerData.direccionEstablecimiento !== issuerData.direccionMatriz ? `<div>Establ: ${issuerData.direccionEstablecimiento}</div>` : ''}
            ${issuerData?.telefono ? `<div>Telf: ${issuerData.telefono}</div>` : ''}
            ${issuerData?.correo ? `<div>Email: ${issuerData.correo}</div>` : ''}
            ${!isNotaVentaActual ? `<div>Obligado Contabilidad: ${issuerData?.obligadoContabilidad ? 'SI' : 'NO'}</div>` : ''}
            ${!isNotaVentaActual && issuerData?.contribuyenteRegimen ? `<div style="font-size: 9px; font-weight: bold;">Régimen: ${issuerData.contribuyenteRegimen}</div>` : ''}

            <div class="divider"></div>

            <!-- Datos del Comprobante -->
            <div class="font-bold" style="font-size: ${is58 ? '11px' : '14px'}; margin-top: 4px;">
              ${isNotaVentaActual ? 'NOTA DE VENTA' : 'FACTURA ELECTRÓNICA'}
            </div>
            ${!isNotaVentaActual ? `
              <div class="font-bold">No. ${claveAcceso.substring(24, 27)}-${claveAcceso.substring(27, 30)}-${claveAcceso.substring(30, 39)}</div>
              <div style="font-size: 9px; text-align: left; margin-top: 4px;">
                <div><b>F. Emisión:</b> ${new Date().toLocaleString('es-EC')}</div>
                <div><b>Ambiente:</b> PRUEBAS (1)</div>
                <div><b>Emisión:</b> NORMAL</div>
                <div><b>Clave Acceso:</b></div>
                <div style="word-break: break-all; font-size: 8px;">${claveAcceso}</div>
              </div>
            ` : `
              <div class="font-bold">Ref: ${claveAcceso}</div>
              <div style="font-size: 9px; text-align: left; margin-top: 4px;">
                <div><b>Fecha:</b> ${new Date().toLocaleString('es-EC')}</div>
              </div>
            `}
          </div>
          
          <div class="divider"></div>
          
          <!-- Datos del Cliente -->
          <div style="font-size: ${is58 ? '9px' : '11px'};">
            <div><b>CLIENTE:</b> ${customerData?.nombre || 'CONSUMIDOR FINAL'}</div>
            <div><b>RUC/CI:</b> ${customerData?.numeroIdentificacion || '9999999999999'}</div>
            ${customerData?.direccion ? `<div><b>DIRECCIÓN:</b> ${customerData.direccion}</div>` : ''}
            ${customerData?.telefono ? `<div><b>TELÉFONO:</b> ${customerData.telefono}</div>` : ''}
            ${customerData?.correo ? `<div><b>CORREO:</b> ${customerData.correo}</div>` : ''}
          </div>
          
          <div class="divider"></div>
          
          <!-- Detalle de Productos -->
          <table>
            <thead>
              <tr>
                <th>CANT</th>
                <th>DESCRIPCIÓN</th>
                <th class="text-right">P.UNIT</th>
                <th class="text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${productosHTML}
            </tbody>
          </table>
          
          <div class="solid-divider"></div>
          
          <!-- Totales -->
          <table style="margin-left: auto; width: 100%;">
            <tr>
              <td class="text-right">SUBTOTAL:</td>
              <td class="text-right">$${totalsData?.subtotal?.toFixed(2) || '0.00'}</td>
            </tr>
            ${!isNotaVentaActual ? `
            <tr>
              <td class="text-right">BASE 15%:</td>
              <td class="text-right">$${base15.toFixed(2)}</td>
            </tr>
            <tr>
              <td class="text-right">BASE 0%:</td>
              <td class="text-right">$${base0.toFixed(2)}</td>
            </tr>
            <tr>
              <td class="text-right">DESCUENTO:</td>
              <td class="text-right">-$${totalDescuentos.toFixed(2)}</td>
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
          
          <!-- Forma de Pago -->
          <div style="font-size: 9px;">
            <div><b>FORMA DE PAGO:</b> ${paymentMethod === 'EFECTIVO' ? 'EFECTIVO' : 'SISTEMA FINANCIERO'}</div>
            ${paymentMethod === 'TRANSFERENCIA' && transferRecipient ? `<div><b>DESTINATARIO:</b> ${transferRecipient}</div>` : ''}
          </div>

          <div class="divider"></div>
          
          <!-- Código QR y Pie de Página -->
          <div class="text-center mt-2" style="font-size: ${is58 ? '9px' : '11px'};">
            ${!isNotaVentaActual ? `
              <div class="text-center" style="margin: 5px 0;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`https://declaraciones.sri.gob.ec/comprobantes-electronicos-internet/publico/detalleComprobante.jsf?claveAcceso=${claveAcceso}`)}" style="width: 100px; height: 100px;" alt="QR SRI" />
                <div style="font-size: 7px; color: #666; margin-top: 2px;">Escanea para verificar en el SRI</div>
              </div>
            ` : ''}
            <p style="margin: 10px 0 0 0; font-weight: bold;">¡Gracias por su compra!</p>
            <p style="margin: 2px 0;">Desarrollado por gravitydenim.com</p>
          </div>
          
          <div style="height: 35px;"></div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 600);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };
