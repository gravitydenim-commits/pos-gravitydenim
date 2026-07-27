const PdfPrinter = require('pdfmake/js/Printer').default || require('pdfmake/js/Printer');

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

const URLResolver = require('pdfmake/js/URLResolver').default || require('pdfmake/js/URLResolver');
const { virtualfs } = require('pdfmake');
const urlResolver = new URLResolver(virtualfs);
const printer = new PdfPrinter(fonts, virtualfs, urlResolver);

const bwipjs = require('bwip-js');

async function generateRidePdf({ issuerData, customer, cart, totalsData, claveAcceso, numeroComprobante, fecha, paymentDetails }) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Validaciones previas de datos obligatorios del emisor
      if (!issuerData) {
        return reject(new Error("No se puede generar el RIDE PDF: el objeto issuerData no está definido."));
      }
      if (!issuerData.ruc || String(issuerData.ruc).trim() === '') {
        return reject(new Error("No se puede generar el RIDE PDF: falta el RUC en el perfil fiscal del emisor."));
      }
      if (!issuerData.razonSocial && !issuerData.name) {
        return reject(new Error("No se puede generar el RIDE PDF: falta la Razón Social en el perfil fiscal del emisor."));
      }
      if (!issuerData.direccionMatriz && !issuerData.address) {
        return reject(new Error("No se puede generar el RIDE PDF: falta la Dirección Matriz en el perfil fiscal del emisor."));
      }

      // 2. Determinar ambiente real (Producción vs Pruebas)
      const isProd = (claveAcceso && claveAcceso.length === 49 && claveAcceso[23] === '2') || issuerData.ambiente === '2' || process.env.SRI_ENVIRONMENT === 'production';
      const ambienteTexto = isProd ? 'PRODUCCIÓN' : 'PRUEBAS';

      // 3. Generar Código de Barras Code 128 en PNG Base64
      let barcodeDataUrl = null;
      if (claveAcceso && claveAcceso.length === 49) {
        try {
          const barcodeBuffer = await bwipjs.toBuffer({
            bcid: 'code128',
            text: claveAcceso,
            scale: 3,
            height: 11,
            includetext: false
          });
          barcodeDataUrl = `data:image/png;base64,${barcodeBuffer.toString('base64')}`;
        } catch (errBar) {
          console.error("Error generando código de barras Code 128:", errBar);
        }
      }

      // 4. Formatear fechas sin Invalid Date ni undefined
      let fechaAuthObj;
      if (fecha) {
        if (fecha.seconds) fechaAuthObj = new Date(fecha.seconds * 1000);
        else fechaAuthObj = new Date(fecha);
      } else {
        fechaAuthObj = new Date();
      }
      if (isNaN(fechaAuthObj.getTime())) fechaAuthObj = new Date();

      const fechaAuthStr = fechaAuthObj.toLocaleString('es-EC');
      const fechaEmisionStr = fechaAuthObj.toLocaleDateString('es-EC');

      // 5. Sanitizar campos del Emisor y Cliente (CERO 'undefined' / 'N/A')
      const razonSocialEmisor = issuerData.razonSocial || issuerData.name;
      const nombreComercialEmisor = issuerData.nombreComercial || razonSocialEmisor;
      const rucEmisor = issuerData.ruc;
      const dirMatrizEmisor = issuerData.direccionMatriz || issuerData.address;
      const dirEstablecimientoEmisor = issuerData.direccionEstablecimiento || dirMatrizEmisor;
      const contribuyenteEspecialEmisor = issuerData.contribuyenteEspecial && String(issuerData.contribuyenteEspecial).trim() !== '' ? issuerData.contribuyenteEspecial : 'NO';
      const obligadoContabilidadEmisor = issuerData.obligadoContabilidad ? 'SI' : 'NO';

      const nombreCliente = customer.nombre || customer.razonSocial || 'CONSUMIDOR FINAL';
      const rucCliente = customer.numeroIdentificacion || customer.identificacion || '9999999999999';
      const dirCliente = customer.direccion || 'S/N';
      const correoCliente = customer.correo || customer.email || 'S/N';
      const telCliente = customer.telefono || 'S/N';
      const vendedorNombre = customer.vendedor || 'PUNTO DE VENTA';
      const observacionesTexto = customer.observaciones || '---';

      // 6. Formas de pago (Líneas mixtas o línea única)
      let paymentRows = [];
      if (paymentDetails && paymentDetails.payments && paymentDetails.payments.length > 0) {
        paymentRows = paymentDetails.payments.map(p => {
          let label = p.method === 'EFECTIVO' ? '01 - SIN UTILIZACION DEL SISTEMA FINANCIERO (EFECTIVO)' :
                      p.method === 'TRANSFERENCIA' ? `20 - OTROS CON UTILIZACION DEL SISTEMA FINANCIERO (TRANSFERENCIA ${p.recipientName ? `A ${p.recipientName}` : ''})` :
                      `20 - OTROS CON UTILIZACION DEL SISTEMA FINANCIERO (${p.method})`;
          if (p.reference) label += ` [Ref: ${p.reference}]`;
          return [
            { text: label, fontSize: 7.5 },
            { text: `$${Number(p.amount).toFixed(2)}`, alignment: 'right', fontSize: 7.5, bold: true }
          ];
        });
      } else {
        paymentRows = [
          [
            { text: '01 - SIN UTILIZACION DEL SISTEMA FINANCIERO', fontSize: 7.5 },
            { text: `$${Number(totalsData.total).toFixed(2)}`, alignment: 'right', fontSize: 7.5, bold: true }
          ]
        ];
      }

      // 7. Definición de documento pdfmake con diseño profesional de Factura SRI
      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [30, 30, 30, 30],
        defaultStyle: {
          font: 'Helvetica',
          fontSize: 8,
          color: '#1e293b'
        },
        content: [
          // CABECERA (Izquierda Emisor, Derecha SRI)
          {
            columns: [
              // Columna Izquierda: Logo y Datos Emisor
              {
                width: '50%',
                stack: [
                  { text: nombreComercialEmisor, fontSize: 18, bold: true, margin: [0, 0, 0, 10], color: '#1e3a8a' },
                  {
                    table: {
                      widths: ['*'],
                      body: [
                        [
                          {
                            stack: [
                              { text: razonSocialEmisor, bold: true, fontSize: 9.5, margin: [0, 0, 0, 4], color: '#0f172a' },
                              { text: `Dirección Matriz: ${dirMatrizEmisor}`, margin: [0, 0, 0, 2] },
                              { text: `Dirección Establecimiento: ${dirEstablecimientoEmisor}`, margin: [0, 0, 0, 2] },
                              { text: `Contribuyente Especial No: ${contribuyenteEspecialEmisor}`, margin: [0, 0, 0, 2] },
                              { text: `OBLIGADO A LLEVAR CONTABILIDAD: ${obligadoContabilidadEmisor}`, bold: true }
                            ],
                            fillColor: '#f8fafc',
                            borderColor: ['#cbd5e1', '#cbd5e1', '#cbd5e1', '#cbd5e1'],
                            padding: [8, 8, 8, 8]
                          }
                        ]
                      ]
                    }
                  }
                ],
                margin: [0, 0, 10, 0]
              },
              // Columna Derecha: Recuadro SRI Factura y Clave de Acceso
              {
                width: '50%',
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        stack: [
                          { text: `R.U.C.: ${rucEmisor}`, fontSize: 11, bold: true, color: '#0f172a' },
                          { text: 'FACTURA', fontSize: 13, bold: true, margin: [0, 4, 0, 4], color: '#1e3a8a' },
                          { text: `No. ${numeroComprobante || '001-100-000000354'}`, bold: true, fontSize: 9 },
                          { text: 'NÚMERO DE AUTORIZACIÓN:', bold: true, margin: [0, 6, 0, 1], fontSize: 7.5 },
                          { text: claveAcceso, fontSize: 7.5, bold: true, color: '#334155' },
                          { text: `FECHA Y HORA DE AUTORIZACIÓN: ${fechaAuthStr}`, margin: [0, 5, 0, 3], fontSize: 7.5 },
                          { text: `AMBIENTE: ${ambienteTexto}`, bold: true, margin: [0, 0, 0, 2], color: isProd ? '#166534' : '#b45309' },
                          { text: 'EMISIÓN: NORMAL', margin: [0, 0, 0, 4] },
                          { text: 'CLAVE DE ACCESO', bold: true, fontSize: 8, margin: [0, 2, 0, 2] },
                          ...(barcodeDataUrl ? [{ image: barcodeDataUrl, fit: [210, 42], alignment: 'center', margin: [0, 3, 0, 3] }] : []),
                          { text: claveAcceso, fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }
                        ],
                        borderColor: ['#cbd5e1', '#cbd5e1', '#cbd5e1', '#cbd5e1'],
                        padding: [8, 8, 8, 8]
                      }
                    ]
                  ]
                }
              }
            ]
          },

          // BLOQUE CLIENTE / COMPRADOR
          {
            margin: [0, 12, 0, 10],
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    columns: [
                      {
                        width: '68%',
                        stack: [
                          { text: `Razón Social / Nombres y Apellidos: ${nombreCliente}`, bold: true },
                          { text: `Identificación: ${rucCliente}`, margin: [0, 2, 0, 0] },
                          { text: `Fecha Emisión: ${fechaEmisionStr}`, margin: [0, 2, 0, 0] }
                        ]
                      },
                      {
                        width: '32%',
                        stack: [
                          { text: `Guía de Remisión: S/N` }
                        ]
                      }
                    ],
                    fillColor: '#f8fafc',
                    borderColor: ['#cbd5e1', '#cbd5e1', '#cbd5e1', '#cbd5e1'],
                    padding: [6, 6, 6, 6]
                  }
                ]
              ]
            }
          },

          // TABLA DETALLE DE PRODUCTOS
          {
            margin: [0, 0, 0, 10],
            table: {
              headerRows: 1,
              widths: [55, 55, 30, '*', 50, 50, 45, 55],
              body: [
                // Cabecera de la Tabla de Productos
                [
                  { text: 'Cod. Principal', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' },
                  { text: 'Cod. Auxiliar', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' },
                  { text: 'Cant', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' },
                  { text: 'Descripción', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' },
                  { text: 'Detalle Adic.', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' },
                  { text: 'Precio Unitario', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' },
                  { text: 'Descuento', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' },
                  { text: 'Precio Total', bold: true, alignment: 'center', fillColor: '#1e3a8a', color: '#ffffff' }
                ],
                // Filas Dinámicas de Productos
                ...cart.map(item => {
                  const qty = Number(item.qty || item.cantidad || 1);
                  const price = Number(item.price || item.precio || 0);
                  const desc = Number(item.descuento || 0);
                  const totalLine = (qty * price) - desc;
                  return [
                    { text: item.sku || item.id || 'N/A', alignment: 'center', fontSize: 7.5 },
                    { text: '---', alignment: 'center', fontSize: 7.5 },
                    { text: qty.toString(), alignment: 'center', fontSize: 7.5 },
                    { text: item.name || item.nombre || 'PRODUCTO', fontSize: 7.5 },
                    { text: '---', alignment: 'center', fontSize: 7.5 },
                    { text: `$${price.toFixed(2)}`, alignment: 'right', fontSize: 7.5 },
                    { text: `$${desc.toFixed(2)}`, alignment: 'right', fontSize: 7.5 },
                    { text: `$${totalLine.toFixed(2)}`, alignment: 'right', fontSize: 7.5 }
                  ];
                })
              ]
            },
            layout: {
              hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => '#cbd5e1',
              vLineColor: () => '#cbd5e1'
            }
          },

          // BLOQUE INFERIOR: INFORMACIÓN ADICIONAL + FORMA DE PAGO + TOTALES
          {
            columns: [
              // Columna Izquierda: Información Adicional y Bloque Independiente de Formas de Pago
              {
                width: '58%',
                margin: [0, 0, 10, 0],
                stack: [
                  // Cuadro Información Adicional
                  {
                    table: {
                      widths: ['*'],
                      body: [
                        [
                          {
                            stack: [
                              { text: 'Información Adicional', bold: true, alignment: 'center', fontSize: 8.5, margin: [0, 0, 0, 4], color: '#1e3a8a' },
                              { text: `Dirección: ${dirCliente}`, margin: [0, 1, 0, 1] },
                              { text: `Email: ${correoCliente}`, margin: [0, 1, 0, 1] },
                              { text: `Teléfono: ${telCliente}`, margin: [0, 1, 0, 1] },
                              { text: `Vendedor: ${vendedorNombre}`, margin: [0, 1, 0, 1] },
                              { text: `Observaciones: ${observacionesTexto}`, margin: [0, 1, 0, 1] }
                            ],
                            borderColor: ['#cbd5e1', '#cbd5e1', '#cbd5e1', '#cbd5e1'],
                            padding: [6, 6, 6, 6]
                          }
                        ]
                      ]
                    }
                  },
                  // Bloque Independiente: Formas de Pago
                  {
                    margin: [0, 8, 0, 0],
                    table: {
                      widths: ['*', 'auto'],
                      body: [
                        [
                          { text: 'Forma de Pago', bold: true, alignment: 'center', fillColor: '#f1f5f9', fontSize: 8, colSpan: 2 },
                          {}
                        ],
                        ...paymentRows
                      ]
                    },
                    layout: {
                      hLineWidth: () => 0.5,
                      vLineWidth: () => 0.5,
                      hLineColor: () => '#cbd5e1',
                      vLineColor: () => '#cbd5e1'
                    }
                  }
                ]
              },

              // Columna Derecha: Cuadro Completo de Totales Tributarios SRI
              {
                width: '42%',
                table: {
                  widths: ['*', 'auto'],
                  body: [
                    [{ text: 'SUBTOTAL 15%', bold: true }, { text: `$${Number(totalsData.baseImponible || totalsData.subtotal || 0).toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'SUBTOTAL 0%', bold: true }, { text: '$0.00', alignment: 'right' }],
                    [{ text: 'SUBTOTAL No objeto de IVA', bold: true }, { text: '$0.00', alignment: 'right' }],
                    [{ text: 'SUBTOTAL Exento de IVA', bold: true }, { text: '$0.00', alignment: 'right' }],
                    [{ text: 'SUBTOTAL SIN IMPUESTOS', bold: true }, { text: `$${Number(totalsData.subtotal || 0).toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'TOTAL Descuento', bold: true }, { text: '$0.00', alignment: 'right' }],
                    [{ text: 'IVA 15%', bold: true }, { text: `$${Number(totalsData.ivaAmount || 0).toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'PROPINA', bold: true }, { text: '$0.00', alignment: 'right' }],
                    [
                      { text: 'VALOR TOTAL', bold: true, fontSize: 9.5, color: '#1e3a8a' },
                      { text: `$${Number(totalsData.total || 0).toFixed(2)}`, alignment: 'right', fontSize: 9.5, bold: true, color: '#1e3a8a' }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => '#cbd5e1',
                  vLineColor: () => '#cbd5e1'
                }
              }
            ]
          }
        ]
      };

      const pdfDoc = await printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', err => reject(err));
      pdfDoc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateRidePdf };
