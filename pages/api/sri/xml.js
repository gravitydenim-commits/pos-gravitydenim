import { getAdminDb } from '../../../src/lib/firebaseAdmin';

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
    const xmlContent = ventaData.xmlAutorizado || ventaData.xmlFirmado;
    
    if (!xmlContent) {
      return res.status(404).json({ error: 'XML no disponible para esta venta' });
    }

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Content-Disposition', `attachment; filename=Factura_${ventaData.numeroComprobante || claveAcceso}.xml`);
    return res.send(xmlContent);
  } catch (error) {
    console.error('Error sirviendo XML:', error);
    return res.status(500).json({ error: 'Error sirviendo XML: ' + error.message });
  }
}
