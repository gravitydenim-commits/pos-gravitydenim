/**
 * sriCreditNote.js — Generador de XML de Nota de Crédito Electrónica para el SRI de Ecuador.
 *
 * La librería osodreamer-sri-xml-signer solo genera XML de <factura> (codDoc: '01').
 * Este módulo genera el XML de <notaCredito> (codDoc: '04') según la Ficha Técnica
 * del SRI, y calcula la clave de acceso con dígito verificador módulo 11.
 *
 * Las funciones signXml(), validateXml() y authorizeXml() de osodreamer son genéricas
 * y funcionan con cualquier XML firmado, por lo que se reutilizan para NC.
 */

const { Builder } = require('xml2js');

const pad = (n, len) => String(n).padStart(len, '0');
const pad2 = (n) => String(n).padStart(2, '0');
const round2 = (val) => Number(Number(val).toFixed(2));

/**
 * Calcula el dígito verificador módulo 11 del SRI.
 * Pesos: 2,3,4,5,6,7 aplicados de derecha a izquierda.
 * @param {string} base48 — Cadena de 48 dígitos numéricos.
 * @returns {string} — Dígito verificador (1 carácter).
 */
function calcularDigitoVerificadorMod11(base48) {
  const pesos = [2, 3, 4, 5, 6, 7];
  let suma = 0;

  // Iterar de derecha a izquierda
  for (let i = base48.length - 1, w = 0; i >= 0; i--, w++) {
    suma += parseInt(base48[i], 10) * pesos[w % pesos.length];
  }

  const residuo = suma % 11;
  const resultado = 11 - residuo;

  if (resultado === 11) return '0';
  if (resultado === 10) return '1';
  return String(resultado);
}

/**
 * Genera la clave de acceso de 49 dígitos para un comprobante electrónico SRI.
 *
 * Estructura (49 dígitos):
 *   [8]  Fecha emisión (ddmmaaaa)
 *   [2]  Tipo comprobante (04 para NC)
 *   [13] RUC emisor
 *   [1]  Ambiente (1=pruebas, 2=producción)
 *   [3]  Establecimiento
 *   [3]  Punto de emisión
 *   [9]  Secuencial
 *   [8]  Código numérico (aleatorio)
 *   [1]  Tipo emisión (1=normal)
 *   [1]  Dígito verificador (módulo 11)
 *
 * @param {Object} params
 * @returns {string} clave de acceso de 49 dígitos
 */
function generarClaveAcceso({ fechaEmision, tipoComprobante, ruc, ambiente, estab, ptoEmi, secuencial }) {
  const fecha = fechaEmision instanceof Date ? fechaEmision : new Date(fechaEmision);
  const fechaStr = pad2(fecha.getDate()) + pad2(fecha.getMonth() + 1) + String(fecha.getFullYear());

  const codNumerico = pad(Math.floor(Math.random() * 100000000), 8);
  const tipoEmision = '1'; // Emisión normal

  const base48 =
    fechaStr +                      // 8 dígitos
    pad(tipoComprobante, 2) +       // 2 dígitos (04 para NC)
    ruc +                           // 13 dígitos
    String(ambiente) +              // 1 dígito
    pad(estab, 3) +                 // 3 dígitos
    pad(ptoEmi, 3) +                // 3 dígitos
    pad(secuencial, 9) +            // 9 dígitos
    codNumerico +                   // 8 dígitos
    tipoEmision;                    // 1 dígito

  if (base48.length !== 48) {
    throw new Error(`Clave de acceso base debe tener 48 dígitos, tiene ${base48.length}: ${base48}`);
  }

  const digitoVerificador = calcularDigitoVerificadorMod11(base48);
  return base48 + digitoVerificador;
}

/**
 * Formatea una fecha en el formato SRI: dd/mm/yyyy
 * @param {Date} d
 * @returns {string}
 */
function formatSriDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Genera el XML completo de una Nota de Crédito Electrónica según la Ficha Técnica del SRI.
 *
 * @param {Object} params
 * @param {Object} params.emisor — Datos del emisor (razonSocial, nombreComercial, ruc, etc.)
 * @param {Object} params.facturaOriginal — Documento de la factura original de Firestore
 * @param {string} params.motivo — Razón de la reversión
 * @param {number} params.ambiente — 1=pruebas, 2=producción
 * @param {string} params.estab — Establecimiento (e.g., '001')
 * @param {string} params.ptoEmi — Punto de emisión (e.g., '100')
 * @param {string} params.secuencial — Secuencial de NC (e.g., '000000001')
 * @param {string} params.claveAcceso — Clave de acceso generada previamente
 *
 * @returns {string} XML generado (sin firmar)
 */
function generarXmlNotaCredito({
  emisor,
  facturaOriginal,
  motivo,
  ambiente,
  estab,
  ptoEmi,
  secuencial,
  claveAcceso
}) {
  const ahora = new Date();
  const cliente = facturaOriginal.cliente || facturaOriginal.customer || {};

  // Extraer totales de la factura original
  const subtotalSinImpuestos = round2(facturaOriginal.totals?.subtotal || facturaOriginal.subtotalSinImpuestos || facturaOriginal.subtotal || 0);
  const valorIva = round2(facturaOriginal.totals?.ivaAmount || facturaOriginal.valorIva || facturaOriginal.ivaAmount || 0);
  const importeTotal = round2(facturaOriginal.totals?.total || facturaOriginal.importeTotal || facturaOriginal.total || 0);

  // Extraer fecha de emisión de la factura original
  let fechaFacturaOriginal;
  const rawDate = facturaOriginal.fechaTransaccion || facturaOriginal.fechaEmision || facturaOriginal.createdAt;
  if (rawDate && typeof rawDate.toDate === 'function') {
    fechaFacturaOriginal = rawDate.toDate();
  } else if (rawDate && rawDate.seconds) {
    fechaFacturaOriginal = new Date(rawDate.seconds * 1000);
  } else if (rawDate) {
    fechaFacturaOriginal = new Date(rawDate);
  } else {
    fechaFacturaOriginal = new Date();
  }

  // Determinar el código de porcentaje IVA de la factura original
  const codigoPorcentajeIva = facturaOriginal.productos?.[0]?.impuestos?.impuesto?.[0]?.codigoPorcentaje
    || facturaOriginal.items?.[0]?.impuestos?.impuesto?.[0]?.codigoPorcentaje
    || '4'; // Default: IVA 15% (código 4)

  // Determinar tarifa IVA
  const tarifaIva = facturaOriginal.productos?.[0]?.impuestos?.impuesto?.[0]?.tarifa
    || facturaOriginal.items?.[0]?.impuestos?.impuesto?.[0]?.tarifa
    || 15;

  // Tipo de identificación del comprador
  const tipoIdMap = {
    'CEDULA': '05',
    'RUC': '04',
    'CONSUMIDOR_FINAL': '07',
    'PASAPORTE': '06'
  };
  const tipoIdentificacion = tipoIdMap[cliente.tipoDocumento] || cliente.tipoIdentificacion || '05';

  // Construir detalles a partir de los productos de la factura original
  const productos = facturaOriginal.productos || facturaOriginal.items || [];
  const detallesXml = productos.map(prod => {
    const cantidad = prod.qty || prod.cantidad || 1;
    const precioUnit = round2(prod.price || prod.precio || prod.precioUnitario || 0);
    const descuento = round2(prod.descuento || 0);
    const precioTotalSinImp = round2(prod.precioTotalSinImpuesto || (precioUnit * cantidad - descuento));
    const ivaProducto = round2(prod.iva || (precioTotalSinImp * tarifaIva / 100));

    return {
      codigoPrincipal: prod.codigoPrincipal || prod.sku || prod.id || prod.codigo || 'PROD',
      descripcion: prod.descripcion || prod.nombre || prod.name || 'Producto',
      cantidad: cantidad.toFixed(2),
      precioUnitario: precioUnit.toFixed(2),
      descuento: descuento.toFixed(2),
      precioTotalSinImpuesto: precioTotalSinImp.toFixed(2),
      impuestos: {
        impuesto: {
          codigo: '2', // IVA
          codigoPorcentaje: String(codigoPorcentajeIva),
          tarifa: String(tarifaIva),
          baseImponible: precioTotalSinImp.toFixed(2),
          valor: ivaProducto.toFixed(2)
        }
      }
    };
  });

  // Contribuyente RIMPE (si aplica)
  const contribuyenteRimpe = emisor.contribuyenteRimpe || null;

  // Construir el objeto JSON que representará el XML
  const notaCreditoObj = {
    notaCredito: {
      $: { id: 'comprobante', version: '1.1.0' },
      infoTributaria: {
        ambiente: String(ambiente),
        tipoEmision: '1',
        razonSocial: emisor.razonSocial || emisor.name || 'GRAVITY DENIM',
        nombreComercial: emisor.nombreComercial || emisor.razonSocial || emisor.name || 'GRAVITY DENIM',
        ruc: emisor.ruc,
        claveAcceso: claveAcceso,
        codDoc: '04', // Nota de Crédito
        estab: estab,
        ptoEmi: ptoEmi,
        secuencial: secuencial,
        dirMatriz: emisor.direccionMatriz || emisor.dirMatriz || 'AMBATO'
      },
      infoNotaCredito: {
        fechaEmision: formatSriDate(ahora),
        dirEstablecimiento: emisor.direccionEstablecimiento || emisor.direccionMatriz || emisor.dirMatriz || 'AMBATO',
        tipoIdentificacionComprador: tipoIdentificacion,
        razonSocialComprador: cliente.nombre || cliente.name || 'CONSUMIDOR FINAL',
        identificacionComprador: cliente.numeroIdentificacion || cliente.cedula || cliente.ruc || '9999999999999',
        ...(emisor.contribuyenteEspecial ? { contribuyenteEspecial: emisor.contribuyenteEspecial } : {}),
        obligadoContabilidad: emisor.obligadoContabilidad ? 'SI' : 'NO',
        ...(contribuyenteRimpe ? { contribuyenteRimpe: contribuyenteRimpe } : {}),
        codDocModificado: '01', // Factura
        numDocModificado: facturaOriginal.numeroComprobante,
        fechaEmisionDocSustento: formatSriDate(fechaFacturaOriginal),
        totalSinImpuestos: subtotalSinImpuestos.toFixed(2),
        valorModificacion: importeTotal.toFixed(2),
        moneda: 'DOLAR',
        totalConImpuestos: {
          totalImpuesto: {
            codigo: '2',
            codigoPorcentaje: String(codigoPorcentajeIva),
            baseImponible: subtotalSinImpuestos.toFixed(2),
            valor: valorIva.toFixed(2)
          }
        },
        motivo: motivo
      },
      detalles: {
        detalle: detallesXml.length === 1 ? detallesXml[0] : detallesXml
      }
    }
  };

  // Agregar info adicional (email/teléfono del cliente) si disponible
  const camposAdicionales = [];
  if (cliente.correo && cliente.correo !== 'N/A') {
    camposAdicionales.push({ $: { nombre: 'Email' }, _: cliente.correo });
  }
  if (cliente.telefono && cliente.telefono !== 'N/A') {
    camposAdicionales.push({ $: { nombre: 'Telefono' }, _: cliente.telefono });
  }
  // Siempre agregar referencia a la factura original
  camposAdicionales.push({ $: { nombre: 'FacturaOriginal' }, _: facturaOriginal.numeroComprobante });
  camposAdicionales.push({ $: { nombre: 'MotivoAnulacion' }, _: motivo });

  if (camposAdicionales.length > 0) {
    notaCreditoObj.notaCredito.infoAdicional = {
      campoAdicional: camposAdicionales
    };
  }

  // Serializar a XML
  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8', standalone: undefined },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    headless: false
  });

  const xml = builder.buildObject(notaCreditoObj);
  return xml;
}

module.exports = {
  generarClaveAcceso,
  generarXmlNotaCredito,
  calcularDigitoVerificadorMod11,
  formatSriDate,
  round2
};
