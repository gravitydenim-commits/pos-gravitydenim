import React, { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { AlertTriangle, CheckCircle, X, FileText } from 'lucide-react';

export default function ModalAnularFactura({ venta, onClose, onSuccess }) {
  const [motivo, setMotivo] = useState('Factura emitida incorrectamente');
  const [motivoOtro, setMotivoOtro] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const opcionesMotivo = [
    'Factura emitida incorrectamente',
    'Datos incorrectos del cliente',
    'Error en productos',
    'Error de valor',
    'Factura duplicada',
    'Otro'
  ];

  // Identificador de consumidor final
  const customerId = (venta?.cliente || venta?.customer)?.numeroIdentificacion;
  const isConsumidorFinal = customerId === '9999999999999';

  // Plazo check
  let excedePlazo = false;
  let saleDate = venta?.fechaTransaccion ?? venta?.fechaEmision ?? venta?.date ?? venta?.fecha ?? venta?.createdAt;
  if (saleDate) {
    if (typeof saleDate?.toDate === 'function') {
      saleDate = saleDate.toDate();
    } else if (saleDate?.seconds) {
      saleDate = new Date(saleDate.seconds * 1000);
    } else {
      saleDate = new Date(saleDate);
    }
    
    if (saleDate && !Number.isNaN(saleDate.getTime())) {
      const diffMonths = (new Date() - saleDate) / (1000 * 60 * 60 * 24 * 30.44);
      if (diffMonths > 12) {
        excedePlazo = true;
      }
    }
  }

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const auth = getAuth();
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      
      const motivoFinal = motivo === 'Otro' ? motivoOtro : motivo;
      
      const response = await fetch('/api/sri/nota-credito', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          facturaClaveAcceso: venta.claveAcceso || venta.id,
          motivo: motivoFinal,
          emisorId: venta.emisorId || venta.issuerId || 'hermano_geovanny'
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al procesar la Nota de Crédito en el SRI');
      }
      
      setSuccess({
        numeroComprobante: data.numeroComprobante,
        claveAcceso: data.claveAcceso,
        estado: data.estado || 'AUTORIZADO',
        numeroAutorizacion: data.numeroAutorizacion
      });
      
      if (onSuccess) {
        onSuccess(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled = isConsumidorFinal || excedePlazo || loading || (motivo === 'Otro' && !motivoOtro.trim());

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText />
            Revertir Factura con Nota de Crédito
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1' }}>
            <X />
          </button>
        </div>

        {success ? (
          <div style={{ background: 'rgba(52, 211, 153, 0.2)', border: '1px solid #34d399', borderRadius: '8px', padding: '15px', marginBottom: '20px', color: '#34d399' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', fontWeight: 'bold' }}>
              <CheckCircle />
              ¡Nota de Crédito Autorizada!
            </div>
            <div><strong>Nro Comprobante:</strong> {success.numeroComprobante}</div>
            <div><strong>Clave Acceso:</strong> {success.claveAcceso}</div>
            {success.numeroAutorizacion && <div><strong>Autorización:</strong> {success.numeroAutorizacion}</div>}
            
            <button 
              onClick={onClose}
              style={{ marginTop: '15px', width: '100%', padding: '10px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.9rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px' }}>
              <div>
                <h4 style={{ margin: '0 0 5px 0', color: 'var(--accent)' }}>Factura a revertir</h4>
                <div><b>Número:</b> {venta.numeroComprobante || 'S/N'}</div>
                <div><b>Cliente:</b> {(venta.cliente || venta.customer)?.nombre}</div>
                <div><b>Monto Total:</b> ${(venta.totals?.total || venta.total || 0).toFixed(2)}</div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 5px 0', color: 'transparent', userSelect: 'none' }}>.</h4>
                <div style={{ wordBreak: 'break-all' }}><b>Clave:</b> {venta.claveAcceso || venta.id}</div>
                <div><b>Fecha:</b> {venta.fechaEmision || venta.fechaTransaccion?.toDate?.().toLocaleDateString() || 'S/F'}</div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.4)', borderRadius: '8px', padding: '12px', color: '#fbbf24', display: 'flex', gap: '10px' }}>
              <AlertTriangle size={24} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.9rem' }}>
                Se emitirá una Nota de Crédito Electrónica real ante el SRI que revierte el 100% de esta factura. La factura original conservará su autorización pero quedará marcada como REVERTIDA CON NOTA DE CRÉDITO.
              </div>
            </div>

            {isConsumidorFinal && (
              <div style={{ marginBottom: '1.5rem', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.4)', borderRadius: '8px', padding: '12px', color: '#f87171', display: 'flex', gap: '10px' }}>
                <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.9rem' }}>
                  Esta factura no puede revertirse. Las facturas emitidas a CONSUMIDOR FINAL no admiten Nota de Crédito según normativa SRI vigente (Resoluciones NAC-DGERCGC25-00000014 y NAC-DGERCGC25-00000017).
                </div>
              </div>
            )}

            {excedePlazo && (
              <div style={{ marginBottom: '1.5rem', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.4)', borderRadius: '8px', padding: '12px', color: '#f87171', display: 'flex', gap: '10px' }}>
                <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.9rem' }}>
                  Esta factura excede el plazo de 12 meses permitido por el SRI para emisión de Notas de Crédito.
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Motivo de anulación:</label>
              <select 
                value={motivo} 
                onChange={(e) => setMotivo(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', marginBottom: motivo === 'Otro' ? '10px' : '0' }}
              >
                {opcionesMotivo.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              
              {motivo === 'Otro' && (
                <input 
                  type="text" 
                  value={motivoOtro} 
                  onChange={(e) => setMotivoOtro(e.target.value)}
                  placeholder="Especifique el motivo..."
                  maxLength={300}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
                />
              )}
            </div>

            {error && (
              <div style={{ marginBottom: '1.5rem', background: 'rgba(248, 113, 113, 0.2)', border: '1px solid #f87171', borderRadius: '8px', padding: '12px', color: '#f87171', fontSize: '0.9rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button 
                onClick={onClose} 
                disabled={loading}
                style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSubmit} 
                disabled={isSubmitDisabled}
                style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: isSubmitDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: isSubmitDisabled ? 0.5 : 1 }}
              >
                {loading && <div style={{width: '14px', height: '14px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite'}}></div>}
                {loading ? 'Procesando solicitud ante el SRI...' : 'Emitir Nota de Crédito al SRI'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
