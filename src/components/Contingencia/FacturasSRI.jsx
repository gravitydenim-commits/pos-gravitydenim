import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { AlertTriangle, CheckCircle, RefreshCw, Printer, Search } from 'lucide-react';

export default function FacturasSRI() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contingencia'); // 'contingencia' o 'historial'
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    // Usar 'ventas' en lugar de 'sales' y ordenar por fechaTransaccion
    const q = query(collection(db, 'ventas'), orderBy('fechaTransaccion', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVentas(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filtrar
  const facturasContingencia = ventas.filter(v => v.status === 'CONTINGENCIA_LOCAL' || v.status === 'RECHAZADO');
  const facturasMostradas = activeTab === 'contingencia' ? facturasContingencia : ventas;

  const handleReenviar = async (venta) => {
    setProcesando(true);
    try {
      console.log(`Intentando reenviar factura ${venta.id} al SRI...`);
      const response = await fetch('/api/sri/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cart: venta.items, 
          customer: venta.customer, 
          emisorId: venta.issuerId,
          existingSecuencial: venta.secuencial // Pasamos el secuencial original
        })
      });

      const sriData = await response.json();

      if (sriData.estado === 'AUTORIZADO') {
        // Actualizar en Firebase
        await updateDoc(doc(db, 'ventas', venta.id), {
          status: 'AUTORIZADO',
          numeroComprobante: sriData.numeroComprobante
        });
        alert(`✅ Factura ${sriData.numeroComprobante} AUTORIZADA por el SRI.`);
      } else {
        throw new Error(sriData.message || 'La factura no fue autorizada en el reintento.');
      }
    } catch (error) {
      alert(`⚠️ Fallo el reintento: ${error.message}`);
    } finally {
      setProcesando(false);
    }
  };

  const handleReimprimir = (venta) => {
    // Generar ventana de impresión simple o redirigir a un modal
    const htmlContent = `
      <html>
      <head><title>Reimpresión Ticket ${venta.numeroComprobante || venta.claveAcceso}</title>
      <style>
        body { font-family: monospace; width: 300px; padding: 10px; }
        .divider { border-bottom: 1px dashed black; margin: 10px 0; }
        .text-center { text-align: center; }
        table { width: 100%; font-size: 12px; }
      </style>
      </head>
      <body>
        <div class="text-center">
          <h3>*** REIMPRESIÓN ***</h3>
          <h3>${venta.issuerName || 'GRAVITY DENIM'}</h3>
          <p>ESTADO: ${venta.status || 'AUTORIZADO'}</p>
          <p>COMPROBANTE: ${venta.numeroComprobante || 'N/A'}</p>
        </div>
        <div class="divider"></div>
        <p>CLIENTE: ${(venta.cliente || venta.customer)?.nombre}</p>
        <p>CI/RUC: ${(venta.cliente || venta.customer)?.numeroIdentificacion}</p>
        <p>FECHA: ${new Date(venta.date?.seconds * 1000 || venta.date).toLocaleString()}</p>
        <div class="divider"></div>
        <table>
          ${(venta.productos || venta.items || []).map(i => `<tr><td>${i.qty}x ${i.name.substring(0, 15)}</td><td style="text-align:right">$${(i.price * i.qty).toFixed(2)}</td></tr>`).join('')}
        </table>
        <div class="divider"></div>
        <p style="margin: 2px 0;"><b>PAGO:</b> ${venta.paymentMethod || 'EFECTIVO'}</p>
        <div class="divider"></div>
        <h3 style="text-align:right">TOTAL: $${(venta.totals?.total || 0).toFixed(2)}</h3>
        <div class="divider"></div>
        <div style="font-size: 10px; word-break: break-all;">CLAVE: ${venta.claveAcceso}</div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
      };
    } else {
      alert("Permite los pop-ups para imprimir.");
    }
  };

  return (
    <div className="report-container animate-fade-in" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2><AlertTriangle className="inline" style={{verticalAlign: 'bottom'}}/> Facturación Electrónica SRI</h2>
        <span style={{color: 'var(--text-muted)'}}>Contingencia y Documentos Emitidos</span>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('contingencia')}
          style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === 'contingencia' ? 'var(--accent)' : 'rgba(0,0,0,0.3)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={18} /> Por Reenviar ({facturasContingencia.length})
        </button>
        <button 
          onClick={() => setActiveTab('historial')}
          style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === 'historial' ? 'var(--accent)' : 'rgba(0,0,0,0.3)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <CheckCircle size={18} /> Historial Completo
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--accent)', padding: '2rem' }}>Cargando documentos...</div>
        ) : facturasMostradas.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No hay documentos para mostrar en esta sección.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px' }}>Fecha</th>
                <th style={{ padding: '12px' }}>Comprobante</th>
                <th style={{ padding: '12px' }}>Emisor</th>
                <th style={{ padding: '12px' }}>Cliente</th>
                <th style={{ padding: '12px' }}>Total</th>
                <th style={{ padding: '12px' }}>Estado</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {facturasMostradas.map(venta => {
                const dateObj = venta.date?.seconds ? new Date(venta.date.seconds * 1000) : new Date(venta.date);
                const isContingency = venta.status === 'CONTINGENCIA_LOCAL' || venta.status === 'RECHAZADO';
                
                return (
                  <tr key={venta.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px' }}>{dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td style={{ padding: '12px' }}>{venta.numeroComprobante || 'S/N'}</td>
                    <td style={{ padding: '12px' }}>{venta.issuerName}</td>
                    <td style={{ padding: '12px' }}>{venta.customer?.nombre || 'Consumidor Final'}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>${(venta.totals?.total || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        fontSize: '0.8rem',
                        backgroundColor: isContingency ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                        color: isContingency ? '#ef4444' : '#22c55e'
                      }}>
                        {venta.status || 'DESCONOCIDO'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {isContingency ? (
                        <button 
                          onClick={() => handleReenviar(venta)}
                          disabled={procesando}
                          style={{ padding: '6px 12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: procesando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
                        >
                          <RefreshCw size={14} className={procesando ? "animate-spin" : ""} /> 
                          {procesando ? 'Enviando...' : 'Reenviar SRI'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleReimprimir(venta)}
                          style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
                        >
                          <Printer size={14} /> Ticket
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
