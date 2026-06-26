export const generarGuiaA4 = (guia, issuerData) => {
  if (!guia || !issuerData) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("⚠️ El navegador bloqueó la ventana de impresión. Por favor, permita los pop-ups.");
    return;
  }

  const isAutorizado = guia.status === 'AUTORIZADO';
  const ambiente = "1"; // 1: Pruebas, 2: Produccion
  const tipoEmision = "1"; // 1: Normal

  const claveAcceso = guia.claveAcceso || "0000000000000000000000000000000000000000000000000";
  const numComprobante = `${issuerData.establecimiento || '001'}-${issuerData.puntoEmision || '100'}-${guia.secuencial || '000000000'}`;

  // Formateo de fechas
  const dateObj = guia.date?.seconds ? new Date(guia.date.seconds * 1000) : new Date(guia.date);
  const fechaEmision = dateObj.toLocaleDateString('es-EC');
  const autorizacionDate = dateObj.toLocaleString('es-EC');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Guía de Remisión A4 - ${numComprobante}</title>
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
          border-collapse: collapse;
        }
        .customer-info td {
          padding: 3px 0;
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
        .items-table .text-center {
          text-align: center;
        }

        .destinatario-box {
          border: 1px solid #000;
          padding: 10px;
          margin-bottom: 15px;
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
            <h2>GUÍA DE REMISIÓN</h2>
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
              <td style="width:60%"><b>Identificación (Transportista):</b> ${guia.transportistaRuc}</td>
              <td style="width:40%"><b>Razón Social / Nombres y Apellidos:</b> ${guia.transportistaNombre}</td>
            </tr>
            <tr>
              <td><b>Placa:</b> ${guia.placa}</td>
              <td><b>Punto de Partida:</b> ${guia.origen}</td>
            </tr>
            <tr>
              <td><b>Fecha inicio Transporte:</b> ${guia.fechaInicio}</td>
              <td><b>Fecha fin Transporte:</b> ${guia.fechaFin}</td>
            </tr>
          </table>
        </div>

        <div class="destinatario-box">
          <p><b>Motivo Traslado:</b> ${guia.motivoTraslado}</p>
          <p><b>Destino (Punto de llegada):</b> ${guia.destino}</p>
          <p><b>Identificación (Destinatario):</b> ${guia.destinatarioRuc}</p>
          <p><b>Razón Social / Nombres Destinatario:</b> ${guia.destinatarioNombre}</p>
          <p><b>Documento Aduanero:</b> ${guia.docAduanero || 'N/A'}</p>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Cantidad</th>
              <th>Descripción</th>
              <th>Código Principal</th>
              <th>Código Auxiliar</th>
            </tr>
          </thead>
          <tbody>
            ${guia.items.map(item => `
              <tr>
                <td class="text-center">${item.cant}</td>
                <td>${item.desc}</td>
                <td>${item.id || 'N/A'}</td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="box" style="width: 50%;">
          <p><b>Información Adicional</b></p>
          <br/>
          <p><b>Email Destinatario:</b> N/A</p>
          <p><b>Teléfono Destinatario:</b> N/A</p>
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
