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

const safeText = (val, fallback = '---') => {
  if (val === undefined || val === null) return fallback;
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null' || str === '[object Object]') {
    return fallback;
  }
  return str;
};

async function generateRidePdf({ 
  issuerData, 
  customer, 
  cart, 
  totalsData, 
  claveAcceso, 
  numeroComprobante, 
  fecha, 
  numeroAutorizacion,
  fechaAutorizacion,
  ambiente,
  paymentDetails 
}) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Validaciones previas de datos obligatorios del emisor
      if (!issuerData) {
        return reject(new Error("No se puede generar el RIDE PDF: el objeto issuerData no está definido."));
      }

      // Sanitización campos del Emisor (CERO 'undefined' / 'null')
      const rucEmisor = safeText(issuerData.ruc || issuerData.rucEmisor || issuerData.taxId, '1804632659001');
      const razonSocialEmisor = safeText(issuerData.razonSocial || issuerData.name, 'DOMINGO FABIAN SANCHEZ RAMIREZ');
      const nombreComercialEmisor = safeText(issuerData.nombreComercial, razonSocialEmisor);
      const dirMatrizEmisor = safeText(issuerData.direccionMatriz || issuerData.address, 'Av. maldonado y Quimiag Centro Comercial de Mayoristas y negocios Andinos.');
      const dirEstablecimientoEmisor = safeText(issuerData.direccionEstablecimiento, dirMatrizEmisor);
      const contribuyenteEspecialEmisor = safeText(issuerData.contribuyenteEspecial, 'NO');
      const obligadoContabilidadEmisor = issuerData.obligadoContabilidad ? 'SI' : 'NO';

      // 2. Determinar ambiente real (PRODUCCIÓN vs PRUEBAS)
      let ambienteTexto = safeText(ambiente, '');
      if (!ambienteTexto) {
        const isProd = (claveAcceso && claveAcceso.length === 49 && claveAcceso[23] === '2') || issuerData.ambiente === '2' || process.env.SRI_ENVIRONMENT === 'production';
        ambienteTexto = isProd ? 'PRODUCCIÓN' : 'PRUEBAS';
      }
      const isProd = ambienteTexto.toUpperCase().includes('PRODUC') || ambienteTexto === '2';

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

      // 4. Formatear fechas de emisión y autorización
      let fechaAuthObj;
      const rawFechaAuth = fechaAutorizacion || fecha;
      if (rawFechaAuth) {
        if (rawFechaAuth.seconds) fechaAuthObj = new Date(rawFechaAuth.seconds * 1000);
        else fechaAuthObj = new Date(rawFechaAuth);
      } else {
        fechaAuthObj = new Date();
      }
      if (isNaN(fechaAuthObj.getTime())) fechaAuthObj = new Date();

      const fechaAuthStr = fechaAuthObj.toLocaleString('es-EC');
      const fechaEmisionStr = fechaAuthObj.toLocaleDateString('es-EC');
      const numAutorizacionStr = safeText(numeroAutorizacion || (claveAcceso && claveAcceso.length === 49 ? claveAcceso : null), 'PENDIENTE');

      // 5. Sanitizar campos del Cliente
      const nombreCliente = safeText(customer.nombre || customer.razonSocial, 'CONSUMIDOR FINAL');
      const rucCliente = safeText(customer.numeroIdentificacion || customer.identificacion, '9999999999999');
      const dirCliente = safeText(customer.direccion, 'N/A');
      const correoCliente = safeText(customer.correo || customer.email, 'N/A');
      const telCliente = safeText(customer.telefono, 'N/A');
      const vendedorNombre = razonSocialEmisor;
      const observacionesTexto = safeText(customer.observaciones, '---');

      // 6. Formas de pago (Líneas mixtas o desde XML parsed)
      let paymentRows = [];
      if (paymentDetails && paymentDetails.customRows && Array.isArray(paymentDetails.customRows) && paymentDetails.customRows.length > 0) {
        paymentRows = paymentDetails.customRows.map(p => [
          { text: safeText(p.label, '01 - SIN UTILIZACION DEL SISTEMA FINANCIERO'), fontSize: 7.5 },
          { text: `$${Number(p.total || 0).toFixed(2)}`, alignment: 'right', fontSize: 7.5, bold: true }
        ]);
      } else if (paymentDetails && paymentDetails.payments && paymentDetails.payments.length > 0) {
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
            { text: `$${Number(totalsData.total || 0).toFixed(2)}`, alignment: 'right', fontSize: 7.5, bold: true }
          ]
        ];
      }

      // 7. Mapeo de Totales Tributarios
      const subtotal15Val = totalsData.subtotal15 !== undefined ? Number(totalsData.subtotal15) : Number(totalsData.baseImponible || totalsData.subtotal || 0);
      const subtotal0Val = Number(totalsData.subtotal0 || 0);
      const subtotalNoObjetoVal = Number(totalsData.subtotalNoObjeto || 0);
      const subtotalExentoVal = Number(totalsData.subtotalExento || 0);
      const subtotalSinImpuestosVal = totalsData.totalSinImpuestos !== undefined ? Number(totalsData.totalSinImpuestos) : Number(totalsData.subtotal || 0);
      const totalDescuentoVal = Number(totalsData.totalDescuento || 0);
      const iva15Val = totalsData.iva15 !== undefined ? Number(totalsData.iva15) : Number(totalsData.ivaAmount || 0);
      const propinaVal = Number(totalsData.propina || 0);
      const valorTotalVal = Number(totalsData.total || 0);

      // 8. Definición de documento pdfmake con diseño profesional de Factura SRI
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
                          { text: `No. ${safeText(numeroComprobante, '001-100-000000001')}`, bold: true, fontSize: 9 },
                          { text: 'NÚMERO DE AUTORIZACIÓN:', bold: true, margin: [0, 6, 0, 1], fontSize: 7.5 },
                          { text: numAutorizacionStr, fontSize: 7.5, bold: true, color: '#334155' },
                          { text: `FECHA Y HORA DE AUTORIZACIÓN: ${fechaAuthStr}`, margin: [0, 5, 0, 3], fontSize: 7.5 },
                          { text: `AMBIENTE: ${ambienteTexto}`, bold: true, margin: [0, 0, 0, 2], color: isProd ? '#166534' : '#b45309' },
                          { text: 'EMISIÓN: NORMAL', margin: [0, 0, 0, 4] },
                          { text: 'CLAVE DE ACCESO', bold: true, fontSize: 8, margin: [0, 2, 0, 2] },
                          ...(barcodeDataUrl ? [{ image: barcodeDataUrl, fit: [210, 42], alignment: 'center', margin: [0, 3, 0, 3] }] : []),
                          { text: safeText(claveAcceso, '---'), fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }
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
                ...(Array.isArray(cart) ? cart.map(item => {
                  const qty = Number(item.qty || item.cantidad || 1);
                  const price = Number(item.price || item.precio || 0);
                  const desc = Number(item.descuento || 0);
                  const totalLine = item.precioTotalSinImpuesto !== undefined ? Number(item.precioTotalSinImpuesto) : ((qty * price) - desc);
                  const codeVal = safeText(item.sku || item.codigo || item.id, '-');

                  return [
                    { text: codeVal, alignment: 'center', fontSize: 7.5 },
                    { text: '---', alignment: 'center', fontSize: 7.5 },
                    { text: qty.toString(), alignment: 'center', fontSize: 7.5 },
                    { text: safeText(item.name || item.nombre, 'PRODUCTO'), fontSize: 7.5 },
                    { text: '---', alignment: 'center', fontSize: 7.5 },
                    { text: `$${price.toFixed(2)}`, alignment: 'right', fontSize: 7.5 },
                    { text: `$${desc.toFixed(2)}`, alignment: 'right', fontSize: 7.5 },
                    { text: `$${totalLine.toFixed(2)}`, alignment: 'right', fontSize: 7.5 }
                  ];
                }) : [])
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
                    [{ text: 'SUBTOTAL 15%', bold: true }, { text: `$${subtotal15Val.toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'SUBTOTAL 0%', bold: true }, { text: `$${subtotal0Val.toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'SUBTOTAL No objeto de IVA', bold: true }, { text: `$${subtotalNoObjetoVal.toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'SUBTOTAL Exento de IVA', bold: true }, { text: `$${subtotalExentoVal.toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'SUBTOTAL SIN IMPUESTOS', bold: true }, { text: `$${subtotalSinImpuestosVal.toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'TOTAL Descuento', bold: true }, { text: `$${totalDescuentoVal.toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'IVA 15%', bold: true }, { text: `$${iva15Val.toFixed(2)}`, alignment: 'right' }],
                    [{ text: 'PROPINA', bold: true }, { text: `$${propinaVal.toFixed(2)}`, alignment: 'right' }],
                    [
                      { text: 'VALOR TOTAL', bold: true, fontSize: 9.5, color: '#1e3a8a' },
                      { text: `$${valorTotalVal.toFixed(2)}`, alignment: 'right', fontSize: 9.5, bold: true, color: '#1e3a8a' }
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
