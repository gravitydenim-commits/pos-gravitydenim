/**
 * Helper para extraer y parsear los datos oficiales del XML del SRI para la generación del RIDE PDF.
 * Funciona tanto con xmlAutorizado como con xmlFirmado.
 */
export function parseSriXml(xmlContent) {
  if (!xmlContent || typeof xmlContent !== 'string' || xmlContent.trim() === '') {
    return null;
  }

  // Si el XML viene envuelto en <autorizacion><comprobante><![CDATA[...]]> o encodado
  let cleanXml = xmlContent;
  if (cleanXml.includes('<![CDATA[')) {
    const cdataMatch = cleanXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdataMatch) {
      cleanXml = cdataMatch[1];
    }
  }

  // Helper para buscar el contenido entre etiquetas XML de forma segura sin lanzar excepciones
  const getTagValue = (tag, src = cleanXml) => {
    if (!src) return '';
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = src.match(regex);
    if (!match) return '';
    let val = match[1].trim();
    // Limpiar CDATA si estuviere envuelto individualmente
    if (val.startsWith('<![CDATA[') && val.endsWith(']]>')) {
      val = val.slice(9, -3).trim();
    }
    return val;
  };

  const infoTributaria = getTagValue('infoTributaria', cleanXml);
  const infoFactura = getTagValue('infoFactura', cleanXml);
  const detallesXml = getTagValue('detalles', cleanXml);
  const infoAdicionalXml = getTagValue('infoAdicional', cleanXml);

  if (!infoTributaria && !infoFactura) {
    return null;
  }

  // 1. Datos Emisor e Info Tributaria
  const ruc = getTagValue('ruc', infoTributaria);
  const razonSocial = getTagValue('razonSocial', infoTributaria);
  const nombreComercial = getTagValue('nombreComercial', infoTributaria) || razonSocial;
  const ambienteCode = getTagValue('ambiente', infoTributaria);
  const ambiente = ambienteCode === '2' ? 'PRODUCCIÓN' : 'PRUEBAS';
  const tipoEmisionCode = getTagValue('tipoEmision', infoTributaria);
  const tipoEmision = tipoEmisionCode === '1' ? 'NORMAL' : 'NORMAL';
  const claveAcceso = getTagValue('claveAcceso', infoTributaria);
  const estab = getTagValue('estab', infoTributaria);
  const ptoEmi = getTagValue('ptoEmi', infoTributaria);
  const secuencial = getTagValue('secuencial', infoTributaria);
  const numeroComprobante = (estab && ptoEmi && secuencial) ? `${estab}-${ptoEmi}-${secuencial}` : '';
  const dirMatriz = getTagValue('dirMatriz', infoTributaria);

  // 2. Info Factura (Comprador, Fecha, Direccion)
  const fechaEmision = getTagValue('fechaEmision', infoFactura);
  const dirEstablecimiento = getTagValue('dirEstablecimiento', infoFactura) || dirMatriz;
  const obligadoContabilidad = (getTagValue('obligadoContabilidad', infoFactura) || 'NO').toUpperCase();
  const contribuyenteEspecial = getTagValue('contribuyenteEspecial', infoFactura) || 'NO';

  const razonSocialComprador = getTagValue('razonSocialComprador', infoFactura) || 'CONSUMIDOR FINAL';
  const identificacionComprador = getTagValue('identificacionComprador', infoFactura) || '9999999999999';
  const direccionComprador = getTagValue('direccionComprador', infoFactura) || 'S/N';
  const tipoIdentificacionComprador = getTagValue('tipoIdentificacionComprador', infoFactura);

  // 3. Desglose de Impuestos de la Factura (<totalConImpuestos>)
  const totalSinImpuestos = parseFloat(getTagValue('totalSinImpuestos', infoFactura) || '0');
  const totalDescuento = parseFloat(getTagValue('totalDescuento', infoFactura) || '0');
  const importeTotal = parseFloat(getTagValue('importeTotal', infoFactura) || '0');
  const propina = parseFloat(getTagValue('propina', infoFactura) || '0');

  const totalImpuestoMatches = infoFactura.match(/<totalImpuesto>[\s\S]*?<\/totalImpuesto>/gi) || [];
  let subtotal15 = 0;
  let subtotal0 = 0;
  let subtotalNoObjeto = 0;
  let subtotalExento = 0;
  let iva15 = 0;

  totalImpuestoMatches.forEach(impStr => {
    const codigo = getTagValue('codigo', impStr);
    const codigoPorcentaje = getTagValue('codigoPorcentaje', impStr);
    const base = parseFloat(getTagValue('baseImponible', impStr) || '0');
    const valor = parseFloat(getTagValue('valor', impStr) || '0');

    if (codigo === '2') { // IVA
      if (codigoPorcentaje === '4' || codigoPorcentaje === '2' || codigoPorcentaje === '15') { // 4 = 15%, 2 = 12%
        subtotal15 += base;
        iva15 += valor;
      } else if (codigoPorcentaje === '0') {
        subtotal0 += base;
      } else if (codigoPorcentaje === '6') {
        subtotalNoObjeto += base;
      } else if (codigoPorcentaje === '7') {
        subtotalExento += base;
      }
    }
  });

  // Fallback si subtotal15 dio 0 pero hay totalSinImpuestos e IVA
  if (subtotal15 === 0 && iva15 > 0) {
    subtotal15 = totalSinImpuestos;
  }

  // 4. Detalles de Productos (<detalles>)
  const detalleMatches = detallesXml.match(/<detalle>[\s\S]*?<\/detalle>/gi) || [];
  const cart = detalleMatches.map(detStr => {
    const codigoPrincipal = getTagValue('codigoPrincipal', detStr) || getTagValue('codigo', detStr) || '-';
    const descripcion = getTagValue('descripcion', detStr) || 'PRODUCTO';
    const cantidad = parseFloat(getTagValue('cantidad', detStr) || '1');
    const precioUnitario = parseFloat(getTagValue('precioUnitario', detStr) || '0');
    const descuento = parseFloat(getTagValue('descuento', detStr) || '0');
    const precioTotalSinImpuesto = parseFloat(getTagValue('precioTotalSinImpuesto', detStr) || '0');

    return {
      id: codigoPrincipal,
      sku: codigoPrincipal,
      name: descripcion,
      qty: cantidad,
      price: precioUnitario,
      descuento,
      precioTotalSinImpuesto
    };
  });

  // 5. Formas de Pago (<pagos>)
  const pagoMatches = infoFactura.match(/<pago>[\s\S]*?<\/pago>/gi) || [];
  const paymentRows = pagoMatches.map(pagoStr => {
    const formaPagoCode = getTagValue('formaPago', pagoStr) || '01';
    const totalPago = parseFloat(getTagValue('total', pagoStr) || '0');

    let label = '01 - SIN UTILIZACION DEL SISTEMA FINANCIERO (EFECTIVO)';
    if (formaPagoCode === '20') {
      label = '20 - OTROS CON UTILIZACION DEL SISTEMA FINANCIERO (TRANSFERENCIA)';
    } else if (formaPagoCode === '16') {
      label = '16 - TARJETA DE DEBITO';
    } else if (formaPagoCode === '19') {
      label = '19 - TARJETA DE CREDITO';
    } else if (formaPagoCode === '15') {
      label = '15 - COMPENSACION DE DEUDAS';
    } else if (formaPagoCode !== '01') {
      label = `${formaPagoCode} - OTROS CON UTILIZACION DEL SISTEMA FINANCIERO`;
    }

    return {
      code: formaPagoCode,
      label,
      total: totalPago
    };
  });

  // 6. Campos Adicionales (Email, Teléfono, etc)
  let email = '';
  let telefono = '';
  const campoMatches = infoAdicionalXml.match(/<campoAdicional[^>]*>[\s\S]*?<\/campoAdicional>/gi) || [];
  campoMatches.forEach(campoStr => {
    const nombreAttr = (campoStr.match(/nombre="([^"]+)"/i) || [])[1] || '';
    const val = getTagValue('campoAdicional', campoStr);
    if (/email|correo/i.test(nombreAttr)) email = val;
    if (/telefono|celular/i.test(nombreAttr)) telefono = val;
  });

  return {
    issuerData: {
      ruc,
      razonSocial,
      nombreComercial,
      direccionMatriz: dirMatriz,
      direccionEstablecimiento: dirEstablecimiento,
      obligadoContabilidad: obligadoContabilidad === 'SI',
      contribuyenteEspecial
    },
    customer: {
      nombre: razonSocialComprador,
      numeroIdentificacion: identificacionComprador,
      direccion: direccionComprador,
      correo: email || 'N/A',
      telefono: telefono || 'N/A',
      tipoIdentificacionComprador
    },
    cart,
    totalsData: {
      subtotal15,
      subtotal0,
      subtotalNoObjeto,
      subtotalExento,
      totalSinImpuestos,
      totalDescuento,
      iva15,
      propina,
      total: importeTotal
    },
    ambiente,
    tipoEmision,
    claveAcceso,
    numeroComprobante,
    fechaEmision,
    paymentRows
  };
}
