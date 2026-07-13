import { getAdminDb } from '../../../src/lib/firebaseAdmin';
import { generateRidePdf } from '../../../src/lib/pdfGenerator';

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
    
    // Obtener datos del emisor
    const emisorId = ventaData.emisorId || ventaData.issuerId || 'hermano_geovanny';
    const emisorDoc = await db.collection('issuers').doc(emisorId).get();
    const issuerData = emisorDoc.exists ? emisorDoc.data() : {
      name: "GRAVITY DENIM",
      ruc: "1803805405001",
      direccionMatriz: "Av. maldonado y Quimiag",
      obligadoContabilidad: false
    };

    // Adaptar carrito para el generador PDF
    const cart = (ventaData.productos || ventaData.items || []).map(p => ({
      id: p.id,
      sku: p.codigoBarras || p.sku || p.codigo || '',
      name: p.name || p.nombre,
      qty: p.qty || p.cantidad || 1,
      price: p.price || p.precio || 0
    }));

    const pdfBuffer = await generateRidePdf({
      issuerData,
      customer: ventaData.cliente || ventaData.customer || { nombre: 'CONSUMIDOR FINAL', numeroIdentificacion: '9999999999999' },
      cart,
      totalsData: ventaData.totals || { subtotal: ventaData.subtotal || 0, ivaAmount: ventaData.ivaAmount || 0, total: ventaData.total || 0 },
      claveAcceso,
      numeroComprobante: ventaData.numeroComprobante,
      fecha: ventaData.fechaTransaccion ? new Date(ventaData.fechaTransaccion) : new Date()
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Factura_${ventaData.numeroComprobante || claveAcceso}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF descarga:', error);
    return res.status(500).json({ error: 'Error generando PDF: ' + error.message });
  }
}
