export const generarFacturaA4 = (venta, issuerData) => {
  if (!venta || !issuerData) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("⚠️ El navegador bloqueó la ventana de impresión. Por favor, permita los pop-ups.");
    return;
  }

  const isAutorizado = venta.status === 'AUTORIZADO';
  const ambiente = "1"; // 1: Pruebas, 2: Produccion
  const tipoEmision = "1"; // 1: Normal

  const claveAcceso = venta.claveAcceso || "0000000000000000000000000000000000000000000000000";
  const numComprobante = venta.numeroComprobante || `${issuerData.establecimiento || '001'}-${issuerData.puntoEmision || '100'}-${venta.secuencial || '000000000'}`;

  // Formateo de fechas
  const dateObj = venta.date?.seconds ? new Date(venta.date.seconds * 1000) : new Date(venta.date);
  const fechaEmision = dateObj.toLocaleDateString('es-EC');
  const autorizacionDate = dateObj.toLocaleString('es-EC');

  // Totales
  const subtotal0 = 0.00; // Siempre 0 según reglas de negocio para esta tienda
  const subtotal15 = venta.totals?.baseImponible || 0;
  const subtotalSinImp = subtotal15; // + subtotal0
  const ivaAmount = venta.totals?.ivaAmount || 0;
  const total = venta.totals?.total || 0;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Factura A4 - ${numComprobante}</title>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap" rel="stylesheet">
      <style>
        @page { size: A4; margin: 10mm; }
        body { 
          font-family: Arial, sans-serif; 
          font-size: 11px; 
          color: #000; 
          margin: 0; 
          padding: 0; 
        }
        .container {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }
        .header-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .box {
          border: 1px solid #000;
          border-radius: 8px;
          padding: 10px;
        }
        .left-box {
          width: 48%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }
        .right-box {
          width: 48%;
        }
        .logo-placeholder {
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 24px;
          margin-bottom: 20px;
          background: #f0f0f0;
          border-radius: 8px;
        }
        h2, h3, p { margin: 2px 0; }
        .barcode-container {
          text-align: center;
          margin-top: 15px;
        }
        .barcode {
          font-family: 'Libre Barcode 128 Text', cursive;
          font-size: 40px;
          line-height: 1;
        }
        
        .customer-info {
          width: 100%;
          margin-bottom: 15px;
        }
        .customer-info table {
          width: 100%;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        .items-table th, .items-table td {
          border: 1px solid #000;
          padding: 5px;
          text-align: left;
        }
        .items-table th {
          background-color: #f9f9f9;
        }
        .items-table .text-right {
          text-align: right;
        }

        .footer-section {
          display: flex;
          justify-content: space-between;
        }
        .additional-info {
          width: 60%;
        }
        .totals {
          width: 35%;
        }
        .totals table {
          width: 100%;
          border-collapse: collapse;
        }
        .totals th, .totals td {
          border: 1px solid #000;
          padding: 4px;
        }
        .totals th { text-align: left; }
        
        .forma-pago {
          width: 60%;
          margin-top: 10px;
          border-collapse: collapse;
        }
        .forma-pago th, .forma-pago td {
          border: 1px solid #000;
          padding: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        
        <div class="header-section">
          <!-- IZQUIERDA -->
          <div class="left-box">
            <div class="logo-placeholder">GRAVITY DENIM</div>
            <div class="box">
              <h3>${issuerData.name}</h3>
              <p><b>GRAVITY DENIM</b></p>
              <br/>
              <p><b>Dirección Matriz:</b> ${issuerData.direccionMatriz || 'N/A'}</p>
              <p><b>Dirección Establecimiento:</b> ${issuerData.direccionMatriz || 'N/A'}</p>
              <br/>
              <p><b>Contribuyente Especial Nro:</b> </p>
              <p><b>OBLIGADO A LLEVAR CONTABILIDAD:</b> ${issuerData.obligadoContabilidad ? 'SI' : 'NO'}</p>
            </div>
          </div>
          
          <!-- DERECHA -->
          <div class="box right-box">
            <h3>R.U.C.: ${issuerData.ruc}</h3>
            <h2>FACTURA</h2>
            <p><b>No.</b> ${numComprobante}</p>
            <br/>
            <p><b>NUMERO DE AUTORIZACION</b></p>
            <p>${claveAcceso}</p>
            <br/>
            <p><b>FECHA Y HORA DE AUTORIZACION</b></p>
            <p>${isAutorizado ? autorizacionDate : 'PENDIENTE'}</p>
            <br/>
            <p><b>AMBIENTE:</b> ${ambiente === '1' ? 'PRUEBAS' : 'PRODUCCIÓN'}</p>
            <p><b>EMISION:</b> ${tipoEmision === '1' ? 'NORMAL' : 'NORMAL'}</p>
            
            <div class="barcode-container">
              <p><b>CLAVE DE ACCESO</b></p>
              <div class="barcode">${claveAcceso}</div>
            </div>
          </div>
        </div>

        <div class="box customer-info">
          <table>
            <tr>
              <td style="width:60%"><b>Razón Social / Nombres y Apellidos:</b> ${venta.customer?.nombre || 'CONSUMIDOR FINAL'}</td>
              <td style="width:40%"><b>Identificación:</b> ${venta.customer?.numeroIdentificacion || '9999999999999'}</td>
            </tr>
            <tr>
              <td><b>Fecha Emisión:</b> ${fechaEmision}</td>
              <td><b>Guía Remisión:</b> </td>
            </tr>
          </table>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Cod. Principal</th>
              <th>Cod. Auxiliar</th>
              <th>Cant</th>
              <th>Descripción</th>
              <th>Det Adicional</th>
              <th>P. Unit</th>
              <th>Desc</th>
              <th>Tot Sin Imp</th>
            </tr>
          </thead>
          <tbody>
            ${venta.items.map(item => `
              <tr>
                <td>${item.id.substring(0,8)}</td>
                <td></td>
                <td class="text-right">${item.qty.toFixed(2)}</td>
                <td>${item.name}</td>
                <td></td>
                <td class="text-right">${(item.price / 1.15).toFixed(4)}</td>
                <td class="text-right">0.00</td>
                <td class="text-right">${((item.price / 1.15) * item.qty).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer-section">
          
          <div class="additional-info">
            <div class="box">
              <p><b>Información Adicional</b></p>
              <br/>
              <table>
                <tr><td width="100"><b>Dir:</b></td><td>${venta.customer?.direccion || 'N/A'}</td></tr>
                <tr><td><b>Telf:</b></td><td>${venta.customer?.telefono || 'N/A'}</td></tr>
                <tr><td><b>Email:</b></td><td>${venta.customer?.correo || 'N/A'}</td></tr>
                <tr><td><b>Vendedor:</b></td><td>CAJA</td></tr>
              </table>
            </div>

            <table class="forma-pago">
              <thead>
                <tr>
                  <th>Forma Pago</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${venta.paymentMethod === 'TRANSFERENCIA' ? 'OTROS CON UTILIZACION DEL SISTEMA FINANCIERO' : 'SIN UTILIZACION DEL SISTEMA FINANCIERO'}</td>
                  <td class="text-right">${total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="totals">
            <table>
              <tr>
                <th>SUBTOTAL 15%</th>
                <td class="text-right">${subtotal15.toFixed(2)}</td>
              </tr>
              <tr>
                <th>SUBTOTAL 0%</th>
                <td class="text-right">${subtotal0.toFixed(2)}</td>
              </tr>
              <tr>
                <th>SUBTOTAL SIN IMPUESTOS</th>
                <td class="text-right">${subtotalSinImp.toFixed(2)}</td>
              </tr>
              <tr>
                <th>TOTAL Descuento</th>
                <td class="text-right">0.00</td>
              </tr>
              <tr>
                <th>IVA 15%</th>
                <td class="text-right">${ivaAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <th>PROPINA</th>
                <td class="text-right">0.00</td>
              </tr>
              <tr>
                <th><b>IMPORTE TOTAL</b></th>
                <td class="text-right"><b>${total.toFixed(2)}</b></td>
              </tr>
            </table>
          </div>

        </div>

      </div>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  // Imprimir luego de que la fuente del código de barras cargue
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 1000);
};
