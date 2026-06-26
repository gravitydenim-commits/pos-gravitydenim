import React, { useState } from 'react';
import { X, Search, FileText } from 'lucide-react';

export default function NuevaGuiaModal({ isOpen, onClose, onSave, salesDB, issuers }) {
  const [formData, setFormData] = useState({
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: new Date().toISOString().split('T')[0],
    motivoTraslado: 'Venta',
    origen: '',
    destino: '',
    transportistaNombre: '',
    transportistaRuc: '',
    placa: '',
    destinatarioNombre: '',
    destinatarioRuc: '',
    docAduanero: '',
    issuerId: issuers[0]?.id || '',
    items: []
  });

  const [facturaSearch, setFacturaSearch] = useState('');

  if (!isOpen) return null;

  const handleImportarFactura = () => {
    // Buscar la factura por comprobante o clave o ID
    const term = facturaSearch.trim();
    const factura = salesDB.find(s => 
      (s.numeroComprobante && s.numeroComprobante.includes(term)) || 
      (s.claveAcceso && s.claveAcceso.includes(term)) ||
      (s.id && s.id === term) ||
      (s.secuencial && s.secuencial.includes(term))
    );
    if (factura) {
      setFormData({
        ...formData,
        destinatarioNombre: factura.customer?.nombre || 'CONSUMIDOR FINAL',
        destinatarioRuc: factura.customer?.numeroIdentificacion || '9999999999999',
        destino: factura.customer?.direccion || '',
        items: factura.items.map(i => ({ cant: i.qty, desc: i.name, id: i.id }))
      });
      alert('✅ Factura importada correctamente');
    } else {
      alert('⚠️ Factura no encontrada');
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      alert('⚠️ Debes incluir al menos un ítem a transportar. Usa el buscador para importar una factura.');
      return;
    }
    onSave({
      ...formData,
      date: new Date(),
      status: 'AUTORIZADO', // Simulamos autorización directa por ahora
      secuencial: Math.floor(Math.random() * 999999).toString().padStart(9, '0'),
      claveAcceso: '1234567890123456789012345678901234567890123456789'
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header">
          <h2><FileText className="inline" /> Emitir Guía de Remisión</h2>
          <button onClick={onClose} className="close-btn"><X /></button>
        </div>
        
        <form onSubmit={handleSave} className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '10px' }}>
          
          <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem', border: '1px solid var(--accent)' }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent)' }}>Importar desde Factura</h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Número o Clave de Factura..." 
                value={facturaSearch}
                onChange={(e) => setFacturaSearch(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-primary" onClick={handleImportarFactura}>
                <Search size={18} /> Importar
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label>Emisor (RUC)</label>
              <select className="input-field" value={formData.issuerId} onChange={(e) => setFormData({...formData, issuerId: e.target.value})} required>
                {issuers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Motivo del Traslado</label>
              <select className="input-field" value={formData.motivoTraslado} onChange={(e) => setFormData({...formData, motivoTraslado: e.target.value})} required>
                <option value="Venta">Venta</option>
                <option value="Compra">Compra</option>
                <option value="Devolución">Devolución</option>
                <option value="Traslado entre establecimientos">Traslado entre establecimientos</option>
                <option value="Otros">Otros</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label>Fecha de Inicio Traslado</label>
              <input type="date" className="input-field" value={formData.fechaInicio} onChange={(e) => setFormData({...formData, fechaInicio: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Fecha Fin Traslado</label>
              <input type="date" className="input-field" value={formData.fechaFin} onChange={(e) => setFormData({...formData, fechaFin: e.target.value})} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label>Punto de Partida (Origen)</label>
              <input type="text" className="input-field" value={formData.origen} onChange={(e) => setFormData({...formData, origen: e.target.value})} required placeholder="Ej. El Tambo, Vía..." />
            </div>
            <div className="form-group">
              <label>Punto de Llegada (Destino)</label>
              <input type="text" className="input-field" value={formData.destino} onChange={(e) => setFormData({...formData, destino: e.target.value})} required />
            </div>
          </div>

          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '15px' }}>Datos del Transportista</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label>Nombre Transportista</label>
              <input type="text" className="input-field" value={formData.transportistaNombre} onChange={(e) => setFormData({...formData, transportistaNombre: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Cédula/RUC Transportista</label>
              <input type="text" className="input-field" value={formData.transportistaRuc} onChange={(e) => setFormData({...formData, transportistaRuc: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Placa del Vehículo</label>
              <input type="text" className="input-field" value={formData.placa} onChange={(e) => setFormData({...formData, placa: e.target.value})} required placeholder="Ej. ABC-1234" />
            </div>
          </div>

          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '15px' }}>Datos del Destinatario</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label>Nombre Destinatario</label>
              <input type="text" className="input-field" value={formData.destinatarioNombre} onChange={(e) => setFormData({...formData, destinatarioNombre: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Cédula/RUC Destinatario</label>
              <input type="text" className="input-field" value={formData.destinatarioRuc} onChange={(e) => setFormData({...formData, destinatarioRuc: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Doc. Aduanero (Opcional)</label>
              <input type="text" className="input-field" value={formData.docAduanero} onChange={(e) => setFormData({...formData, docAduanero: e.target.value})} />
            </div>
          </div>

          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '15px' }}>Ítems a Transportar</h3>
          {formData.items.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Usa el buscador superior para importar ítems desde una factura.</p>
          ) : (
            <table className="pos-table" style={{ marginBottom: '1rem' }}>
              <thead>
                <tr>
                  <th>Cantidad</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.cant}</td>
                    <td>{it.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="modal-actions" style={{ marginTop: '2rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" style={{ background: '#10b981' }}>Emitir Guía de Remisión</button>
          </div>

        </form>
      </div>
    </div>
  );
}
