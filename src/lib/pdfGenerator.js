const PdfPrinter = require('pdfmake');

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

const printer = new PdfPrinter(fonts);

async function generateRidePdf({ issuerData, customer, cart, totalsData, claveAcceso, numeroComprobante, fecha }) {
  return new Promise((resolve, reject) => {
    try {
      const docDefinition = {
        defaultStyle: {
          font: 'Helvetica',
          fontSize: 8
        },
        content: [
          // CABECERA (Izquierda Logo, Derecha Info)
          {
            columns: [
              // Logo y Datos Emisor
              {
                width: '50%',
                stack: [
                  { text: 'GRAVITY DENIM', fontSize: 20, bold: true, margin: [0, 20, 0, 20], color: '#e53e3e' },
                  {
                    table: {
                      widths: ['*'],
                      body: [
                        [{ text: issuerData.name, bold: true, fontSize: 10, border: [true, true, true, false] }],
                        [{ text: `Dirección Matriz: ${issuerData.direccionMatriz || 'N/A'}`, border: [true, false, true, false] }],
                        [{ text: `Contribuyente Especial: ${issuerData.contribuyenteEspecial || 'N/A'}`, border: [true, false, true, false] }],
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
                          { text: `R.U.C.: ${issuerData.ruc}`, fontSize: 12, bold: true },
                          { text: 'FACTURA', fontSize: 14, bold: true, margin: [0, 5, 0, 5] },
                          { text: `No. ${numeroComprobante}`, bold: true },
                          { text: 'NÚMERO DE AUTORIZACIÓN:', margin: [0, 10, 0, 2] },
                          { text: claveAcceso, fontSize: 9 },
                          { text: `FECHA Y HORA DE AUTORIZACIÓN: ${fecha.toLocaleString('es-EC')}`, margin: [0, 10, 0, 5] },
                          { text: 'AMBIENTE: PRUEBAS', margin: [0, 0, 0, 2] },
                          { text: 'EMISIÓN: NORMAL', margin: [0, 0, 0, 10] },
                          { text: 'CLAVE DE ACCESO', bold: true },
                          {
                            // Código de barras generado por pdfmake
                            barcode: claveAcceso,
                            type: 'code128',
                            width: 250,
                            height: 40,
                            margin: [0, 5, 0, 0]
                          },
                          { text: claveAcceso, fontSize: 8, alignment: 'center', margin: [0, 2, 0, 0] }
                        ],
                        border: [true, true, true, true],
                        padding: [10, 10, 10, 10]
                      }
                    ]
                  ]
                }
              }
            ]
          },
          // DATOS DEL CLIENTE
          {
            margin: [0, 20, 0, 10],
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    columns: [
                      {
                        width: '70%',
                        stack: [
                          { text: `Razón Social / Nombres y Apellidos: ${customer.nombre}` },
                          { text: `Identificación: ${customer.numeroIdentificacion}` },
                          { text: `Dirección: ${customer.direccion || 'N/A'}` },
                          { text: `Fecha Emisión: ${fecha.toLocaleDateString('es-EC')}` }
                        ]
                      },
                      {
                        width: '30%',
                        stack: [
                          { text: `Guía de Remisión: ` }
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
                  { text: item.sku || item.id, alignment: 'center' },
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
                    [{ text: 'SUBTOTAL 15%', bold: true }, { text: Number(totalsData.baseImponible).toFixed(2), alignment: 'right' }],
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

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
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
