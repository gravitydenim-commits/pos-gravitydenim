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

async function generateRidePdf({ issuerData, customer, cart, totalsData, claveAcceso, numeroComprobante, fecha }) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Determinar ambiente real a partir del dígito 24 de la Clave de Acceso o emisor
      const isProd = (claveAcceso && claveAcceso.length === 49 && claveAcceso[23] === '2') || issuerData.ambiente === '2' || process.env.SRI_ENVIRONMENT === 'production';
      const ambienteTexto = isProd ? 'PRODUCCIÓN' : 'PRUEBAS';

      // 2. Generar Código de Barras Code 128 en PNG Base64
      let barcodeDataUrl = null;
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

      // Formatear fechas sin Invalid Date ni undefined
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

      const docDefinition = {
        defaultStyle: {
          font: 'Helvetica',
          fontSize: 8
        },
        content: [
          // CABECERA (Izquierda Logo/Emisor, Derecha Info SRI)
          {
            columns: [
              // Logo y Datos Emisor
              {
                width: '50%',
                stack: [
                  { text: 'GRAVITY DENIM', fontSize: 20, bold: true, margin: [0, 10, 0, 15], color: '#e53e3e' },
                  {
                    table: {
                      widths: ['*'],
                      body: [
                        [{ text: issuerData.razonSocial || issuerData.name || 'DOMINGO FABIAN SANCHEZ RAMIREZ', bold: true, fontSize: 10, border: [true, true, true, false] }],
                        [{ text: `Dirección Matriz: ${issuerData.direccionMatriz || issuerData.address || 'AMBATO / AV. CEVALLOS Y SEVILLA'}`, border: [true, false, true, false] }],
                        [{ text: `Contribuyente Especial: ${issuerData.contribuyenteEspecial || 'NO'}`, border: [true, false, true, false] }],
                        [{ text: `OBLIGADO A LLEVAR CONTABILIDAD: ${issuerData.obligadoContabilidad ? 'SI' : 'NO'}`, border: [true, false, true, true] }]
                      ]
                    }
                  }
                ],
                margin: [0, 0, 10, 0]
              },
              // Cuadro SRI
              {
                width: '50%',
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        stack: [
                          { text: `R.U.C.: ${issuerData.ruc || '1804632659001'}`, fontSize: 12, bold: true },
                          { text: 'FACTURA', fontSize: 14, bold: true, margin: [0, 5, 0, 5] },
                          { text: `No. ${numeroComprobante || '001-100-000000354'}`, bold: true },
                          { text: 'NÚMERO DE AUTORIZACIÓN:', margin: [0, 6, 0, 2] },
                          { text: claveAcceso, fontSize: 8, bold: true },
                          { text: `FECHA Y HORA DE AUTORIZACIÓN: ${fechaAuthStr}`, margin: [0, 6, 0, 4] },
                          { text: `AMBIENTE: ${ambienteTexto}`, bold: true, margin: [0, 0, 0, 2] },
                          { text: 'EMISIÓN: NORMAL', margin: [0, 0, 0, 6] },
                          { text: 'CLAVE DE ACCESO', bold: true },
                          ...(barcodeDataUrl ? [{ image: barcodeDataUrl, fit: [205, 42], alignment: 'center', margin: [0, 4, 0, 3] }] : []),
                          { text: claveAcceso, fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }
                        ],
                        border: [true, true, true, true],
                        padding: [8, 8, 8, 8]
                      }
                    ]
                  ]
                }
              }
            ]
          },
          // DATOS DEL CLIENTE
          {
            margin: [0, 15, 0, 10],
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    columns: [
                      {
                        width: '70%',
                        stack: [
                          { text: `Razón Social / Nombres: ${customer.nombre || 'CONSUMIDOR FINAL'}` },
                          { text: `Identificación: ${customer.numeroIdentificacion || '9999999999999'}` },
                          { text: `Dirección: ${customer.direccion || 'S/N'}` },
                          { text: `Fecha Emisión: ${fechaEmisionStr}` }
                        ]
                      },
                      {
                        width: '30%',
                        stack: [
                          { text: `Guía de Remisión: S/N` }
                        ]
                      }
                    ],
                    border: [true, true, true, true],
                    padding: [5, 5, 5, 5]
                  }
                ]
              ]
            }
          },
          // TABLA DE PRODUCTOS
          {
            table: {
              headerRows: 1,
              widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto'],
              body: [
                // Cabecera
                [
                  { text: 'Cod. Principal', bold: true, alignment: 'center' },
                  { text: 'Cant', bold: true, alignment: 'center' },
                  { text: 'Descripción', bold: true, alignment: 'center' },
                  { text: 'Precio Unitario', bold: true, alignment: 'center' },
                  { text: 'Descuento', bold: true, alignment: 'center' },
                  { text: 'Precio Total', bold: true, alignment: 'center' }
                ],
                // Filas (Mapeo dinámico)
                ...cart.map(item => [
                  { text: item.sku || '', alignment: 'center' },
                  { text: item.qty.toString(), alignment: 'center' },
                  { text: item.name },
                  { text: Number(item.price).toFixed(2), alignment: 'right' },
                  { text: '0.00', alignment: 'right' },
                  { text: (item.price * item.qty).toFixed(2), alignment: 'right' }
                ])
              ]
            }
          },
          // TOTALES Y FORMA DE PAGO
          {
            columns: [
              // Forma de pago / Info adicional
              {
                width: '60%',
                margin: [0, 10, 10, 0],
                stack: [
                  {
                    table: {
                      widths: ['*', 'auto'],
                      body: [
                        [{ text: 'Forma de Pago', bold: true, alignment: 'center' }, { text: 'Valor', bold: true, alignment: 'center' }],
                        ['01 - SIN UTILIZACION DEL SISTEMA FINANCIERO', Number(totalsData.total).toFixed(2)]
                      ]
                    }
                  },
                  {
                    margin: [0, 10, 0, 0],
                    table: {
                      widths: ['*'],
                      body: [
                        [
                          {
                            stack: [
                              { text: 'Información Adicional', bold: true, alignment: 'center', margin: [0, 0, 0, 5] },
                              { text: `Email: ${customer.correo || 'N/A'}` },
                              { text: `Teléfono: ${customer.telefono || 'N/A'}` }
                            ]
                          }
                        ]
                      ]
                    }
                  }
                ]
              },
              // Desglose de Totales
              {
                width: '40%',
                margin: [0, 10, 0, 0],
                table: {
                  widths: ['*', 'auto'],
                  body: [
                    [{ text: 'SUBTOTAL 15%', bold: true }, { text: Number(totalsData.baseImponible || totalsData.subtotal || 0).toFixed(2), alignment: 'right' }],
                    [{ text: 'SUBTOTAL 0%', bold: true }, { text: '0.00', alignment: 'right' }],
                    [{ text: 'SUBTOTAL No objeto de IVA', bold: true }, { text: '0.00', alignment: 'right' }],
                    [{ text: 'SUBTOTAL Exento de IVA', bold: true }, { text: '0.00', alignment: 'right' }],
                    [{ text: 'SUBTOTAL SIN IMPUESTOS', bold: true }, { text: Number(totalsData.subtotal).toFixed(2), alignment: 'right' }],
                    [{ text: 'TOTAL Descuento', bold: true }, { text: '0.00', alignment: 'right' }],
                    [{ text: 'IVA 15%', bold: true }, { text: Number(totalsData.ivaAmount).toFixed(2), alignment: 'right' }],
                    [{ text: 'VALOR TOTAL', bold: true, fontSize: 10 }, { text: Number(totalsData.total).toFixed(2), alignment: 'right', fontSize: 10, bold: true }]
                  ]
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
