import { getAdminDb } from '../../../src/lib/firebaseAdmin';
import { generateRidePdf } from '../../../src/lib/pdfGenerator';
import { parseSriXml } from '../../../src/utils/sriXmlParser';
import { calculateTotals } from '../../../src/utils/taxes';

const db = getAdminDb();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { claveAcceso } = req.query;
  if (!claveAcceso) {
    return res.status(400).json({ error: 'Falta claveAcceso' });
  }

  try {
    const ventaDoc = await db.collection('ventas').doc(claveAcceso).get();
    if (!ventaDoc.exists) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    const ventaData = ventaDoc.data();
    const xmlContent = ventaData.xmlAutorizado || ventaData.xmlFirmado || '';
    
    // Parsear el XML oficial si está presente
    const parsedXml = xmlContent ? parseSriXml(xmlContent) : null;
    
    // Obtener datos del emisor en Firestore como fallback
    const emisorId = ventaData.emisorId || ventaData.issuerId || 'hermano_geovanny';
    const emisorDoc = await db.collection('issuers').doc(emisorId).get();
    const issuerDataFs = emisorDoc.exists ? emisorDoc.data() : {};

    // Construir objetos con PREFERENCIA ABSOLUTA AL XML AUTORIZADO
    const issuerData = {
      ruc: (parsedXml?.issuerData?.ruc) || issuerDataFs.ruc || issuerDataFs.rucEmisor || issuerDataFs.taxId || '1804632659001',
      razonSocial: (parsedXml?.issuerData?.razonSocial) || issuerDataFs.razonSocial || issuerDataFs.name || 'DOMINGO FABIAN SANCHEZ RAMIREZ',
      nombreComercial: (parsedXml?.issuerData?.nombreComercial) || issuerDataFs.nombreComercial || issuerDataFs.name || 'GRAVITY DENIM',
      direccionMatriz: (parsedXml?.issuerData?.direccionMatriz) || issuerDataFs.direccionMatriz || issuerDataFs.address || 'Av. maldonado y Quimiag Centro Comercial de Mayoristas y negocios Andinos.',
      direccionEstablecimiento: (parsedXml?.issuerData?.direccionEstablecimiento) || issuerDataFs.direccionEstablecimiento || issuerDataFs.address || 'Av. maldonado y Quimiag Centro Comercial de Mayoristas y negocios Andinos. LOCAL 1901',
      obligadoContabilidad: parsedXml?.issuerData?.obligadoContabilidad !== undefined ? parsedXml.issuerData.obligadoContabilidad : Boolean(issuerDataFs.obligadoContabilidad),
      contribuyenteEspecial: (parsedXml?.issuerData?.contribuyenteEspecial) || issuerDataFs.contribuyenteEspecial || 'NO'
    };

    const customer = {
      nombre: (parsedXml?.customer?.nombre) || (ventaData.cliente || ventaData.customer)?.nombre || 'CONSUMIDOR FINAL',
      numeroIdentificacion: (parsedXml?.customer?.numeroIdentificacion) || (ventaData.cliente || ventaData.customer)?.numeroIdentificacion || (ventaData.cliente || ventaData.customer)?.identificacion || '9999999999999',
      direccion: (parsedXml?.customer?.direccion) || (ventaData.cliente || ventaData.customer)?.direccion || 'N/A',
      correo: (parsedXml?.customer?.correo) || (ventaData.cliente || ventaData.customer)?.correo || (ventaData.cliente || ventaData.customer)?.email || 'N/A',
      telefono: (parsedXml?.customer?.telefono) || (ventaData.cliente || ventaData.customer)?.telefono || 'N/A'
    };

    let cart = [];
    if (parsedXml && parsedXml.cart && parsedXml.cart.length > 0) {
      cart = parsedXml.cart;
    } else {
      const vatIncluded = ventaData.vatIncluded !== false;
      const isNotaVenta = ventaData.isNotaVenta === true;
      const totalsCalc = calculateTotals(ventaData.productos || ventaData.items || [], vatIncluded, isNotaVenta);
      cart = totalsCalc.detalles.map(d => ({
        id: d.id,
        sku: d.sku || '-',
        name: d.nombre,
        qty: d.qty,
        price: d.precioUnitario,
        descuento: 0,
        precioTotalSinImpuesto: d.precioTotalSinImpuesto
      }));
    }

    // Estado y números de autorización oficial
    const isAutorizado = (ventaData.estadoSri === 'AUTORIZADO' || ventaData.estadoSri === 'AUTORIZADA' || Boolean(ventaData.numeroAutorizacion) || parsedXml?.ambiente === 'PRODUCCIÓN');
    const numeroAutorizacion = ventaData.numeroAutorizacion || (isAutorizado ? (ventaData.claveAcceso || claveAcceso) : 'PENDIENTE');
    const fechaAutorizacion = ventaData.fechaAutorizacion || ventaData.fechaTransaccion || new Date();

    const totalsData = parsedXml?.totalsData ? {
      subtotal15: parsedXml.totalsData.subtotal15,
      subtotal0: parsedXml.totalsData.subtotal0,
      subtotalNoObjeto: parsedXml.totalsData.subtotalNoObjeto,
      subtotalExento: parsedXml.totalsData.subtotalExento,
      totalSinImpuestos: parsedXml.totalsData.totalSinImpuestos,
      totalDescuento: parsedXml.totalsData.totalDescuento,
      iva15: parsedXml.totalsData.iva15,
      propina: parsedXml.totalsData.propina,
      total: parsedXml.totalsData.total
    } : {
      subtotal15: ventaData.totals?.subtotal || ventaData.subtotal || 0,
      subtotal0: 0,
      subtotalNoObjeto: 0,
      subtotalExento: 0,
      totalSinImpuestos: ventaData.totals?.subtotal || ventaData.subtotal || 0,
      totalDescuento: 0,
      iva15: ventaData.totals?.ivaAmount || ventaData.ivaAmount || 0,
      propina: 0,
      total: ventaData.totals?.total || ventaData.total || 0
    };

    const ambiente = parsedXml?.ambiente || (claveAcceso && claveAcceso[23] === '2' ? 'PRODUCCIÓN' : 'PRUEBAS');
    const paymentDetails = (parsedXml && parsedXml.paymentRows && parsedXml.paymentRows.length > 0)
      ? { customRows: parsedXml.paymentRows }
      : (ventaData.paymentDetails || null);

    const pdfBuffer = await generateRidePdf({
      issuerData,
      customer,
      cart,
      totalsData,
      claveAcceso,
      numeroComprobante: parsedXml?.numeroComprobante || ventaData.numeroComprobante,
      fecha: fechaAutorizacion,
      numeroAutorizacion,
      fechaAutorizacion,
      ambiente,
      paymentDetails
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Factura_${ventaData.numeroComprobante || claveAcceso}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF descarga:', error);
    return res.status(500).json({ error: 'Error generando PDF: ' + error.message });
  }
}

