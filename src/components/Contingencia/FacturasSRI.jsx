import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { AlertTriangle, CheckCircle, RefreshCw, Printer, Search, FileCode } from 'lucide-react';

const parseSaleDate = (sale) => {
  const rawDate =
    sale?.fechaTransaccion ??
    sale?.fechaEmision ??
    sale?.date ??
    sale?.fecha ??
    sale?.createdAt;

  if (!rawDate) return null;

  if (typeof rawDate?.toDate === 'function') {
    return rawDate.toDate();
  }

  if (rawDate?.seconds) {
    return new Date(rawDate.seconds * 1000);
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function FacturasSRI() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contingencia'); // 'contingencia' o 'historial'
  const [procesando, setProcesando] = useState(false);

  // Estados de filtros
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterSriState, setFilterSriState] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'ventas'), orderBy('fechaTransaccion', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVentas(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filtrar base por pestaña
  const baseList = React.useMemo(() => {
    return activeTab === 'contingencia'
      ? ventas.filter(v => {
          const est = (v.estadoSri || v.status || 'PENDIENTE_ENVIO').toUpperCase();
          return est !== 'AUTORIZADO' && est !== 'AUTORIZADA' && est !== 'NOTA_DE_VENTA';
        })
      : ventas;
  }, [ventas, activeTab]);

  // Aplicar filtros dinámicos
  const facturasMostradas = React.useMemo(() => {
    return baseList.filter(venta => {
      const saleDate = parseSaleDate(venta);
      if (saleDate) {
        const dateStr = saleDate.toISOString().split('T')[0];
        if (filterDateFrom && dateStr < filterDateFrom) return false;
        if (filterDateTo && dateStr > filterDateTo) return false;
      } else if (filterDateFrom || filterDateTo) {
        return false;
      }

      if (filterClient) {
        const clientName = ((venta.cliente || venta.customer)?.nombre || '').toLowerCase();
        if (!clientName.includes(filterClient.toLowerCase())) return false;
      }

      if (filterInvoice) {
        const invoiceNum = (venta.numeroComprobante || venta.claveAcceso || venta.id || '').toLowerCase();
        if (!invoiceNum.includes(filterInvoice.toLowerCase())) return false;
      }

      if (filterSriState) {
        const est = (venta.estadoSri || venta.status || 'PENDIENTE_ENVIO').toUpperCase();
        if (filterSriState === 'AUTORIZADO') {
          if (est !== 'AUTORIZADO' && est !== 'AUTORIZADA') return false;
        } else if (est !== filterSriState.toUpperCase()) {
          return false;
        }
      }

      return true;
    });
  }, [baseList, filterDateFrom, filterDateTo, filterClient, filterInvoice, filterSriState]);

  const handleReenviar = async (venta) => {
    setProcesando(true);
    try {
      const claveAcceso = venta.claveAcceso || venta.id;
      console.log(`Intentando reenviar factura ${claveAcceso} al SRI...`);

      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';

      const response = await fetch('/api/sri/reintentar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ claveAcceso })
      });

      const sriData = await response.json();

      if (response.ok && (sriData.estado === 'AUTORIZADO' || sriData.estadoSri === 'AUTORIZADO')) {
        alert(`✅ Factura ${sriData.numeroComprobante || claveAcceso} AUTORIZADA por el SRI.`);
      } else {
        // Formatear error exacto del SRI
        const est = (sriData.estadoRespuestaSRI || sriData.estado || '').toUpperCase();
        if (est === 'PENDIENTE_ENVIO' || est === 'CONTINGENCIA_LOCAL' || !response.ok && response.status === 504) {
          alert('No fue posible comunicarse con el SRI.');
        } else {
          const cod = sriData.codigoRespuesta || sriData.mensajes?.[0]?.identificador || '';
          const msg = sriData.mensajeRespuesta || sriData.mensajes?.[0]?.mensaje || sriData.error || 'Error en comprobante';
          const info = sriData.informacionAdicional || sriData.mensajes?.[0]?.informacionAdicional || '';

          const header = `SRI ${est}${cod ? ` [${cod}]` : ''}`;
          const lines = [header, msg];
          if (info && info.trim() !== '' && info.trim() !== 'Sin información adicional') {
            lines.push(info.trim());
          }
          alert(lines.join('\n'));
        }
      }
    } catch (error) {
      alert(`No fue posible comunicarse con el SRI.\nDetalle: ${error.message}`);
    } finally {
      setProcesando(false);
    }
  };

  const [selectedVenta, setSelectedVenta] = useState(null);

  const handleReimprimir = async (venta, format) => {
    try {
      const emisorId = venta.emisorId || venta.issuerId || 'hermano_geovanny';
      // Importar getDoc dinámicamente o usar db directo
      const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
      const emisorSnap = await getDoc(firestoreDoc(db, 'issuers', emisorId));
      const emisorData = emisorSnap.exists() ? emisorSnap.data() : { 
        razonSocial: venta.issuerName || "Edgar Geovanny Sanchez Ramirez",
        name: venta.issuerName || "GRAVITY DENIM", 
        ruc: "1803805405001",
        direccionMatriz: "Av. maldonado y Quimiag"
      };

      const { imprimirTicket } = await import('../../utils/printTicket');
      imprimirTicket(
        emisorData,
        venta.productos || venta.items || [],
        venta.totals || { subtotal: venta.subtotal || 0, ivaAmount: venta.ivaAmount || 0, total: venta.total || 0 },
        venta.cliente || venta.customer || { nombre: 'CONSUMIDOR FINAL', numeroIdentificacion: '9999999999999' },
        venta.claveAcceso || venta.id,
        venta.paymentMethod || 'EFECTIVO',
        venta.transferRecipient,
        venta.isNotaVenta || false,
        format,
        true // isReprint = true
      );
    } catch (err) {
      alert("Error al reimprimir: " + err.message);
    }
  };

  const handleReimprimirClick = (venta) => {
    const estado = venta.status || venta.estadoSri;
    const isNota = venta.isNotaVenta || (estado === 'NOTA_DE_VENTA');
    if (!isNota && estado !== 'AUTORIZADO' && estado !== 'AUTORIZADA') {
      alert(`⚠️ NO SE PUEDE REIMPRIMIR:\nEl comprobante no está autorizado por el SRI. Estado actual: ${estado || 'PENDIENTE'}`);
      return;
    }

    // Auto-detectar formato configurado en localStorage
    const printerFormat = localStorage.getItem('printerFormat') || '80mm';
    handleReimprimir(venta, printerFormat);
  };

  const contingencyCount = React.useMemo(() => {
    return ventas.filter(v => {
      const est = (v.estadoSri || v.status || 'PENDIENTE_ENVIO').toUpperCase();
      return est !== 'AUTORIZADO' && est !== 'AUTORIZADA' && est !== 'NOTA_DE_VENTA';
    }).length;
  }, [ventas]);

  const renderStatusBadge = (estadoSri) => {
    const status = (estadoSri || 'PENDIENTE_ENVIO').toUpperCase();
    let bg = 'rgba(245, 158, 11, 0.2)';
    let color = '#f59e0b';
    let text = 'PENDIENTE';

    if (status === 'AUTORIZADO' || status === 'AUTORIZADA') {
      bg = 'rgba(34, 197, 94, 0.2)';
      color = '#22c55e';
      text = 'AUTORIZADA';
    } else if (status === 'RECHAZADA' || status === 'RECHAZADO' || status === 'ERROR_INTERNO' || status === 'ERROR_FIRMA' || status === 'ERROR') {
      bg = 'rgba(239, 68, 68, 0.2)';
      color = '#ef4444';
      text = status;
    } else if (status === 'ENVIANDO') {
      bg = 'rgba(59, 130, 246, 0.2)';
      color = '#3b82f6';
      text = 'ENVIANDO';
    } else if (status === 'RECIBIDA_SRI' || status === 'RECIBIDA') {
      bg = 'rgba(16, 185, 129, 0.2)';
      color = '#10b981';
      text = 'RECIBIDA SRI';
    } else if (status === 'DEVUELTA') {
      bg = 'rgba(107, 114, 128, 0.2)';
      color = '#9ca3af';
      text = 'DEVUELTA';
    }

    return (
      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: bg, color: color }}>
        {text}
      </span>
    );
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
          <RefreshCw size={18} /> Por Reenviar ({contingencyCount})
        </button>
        <button 
          onClick={() => setActiveTab('historial')}
          style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === 'historial' ? 'var(--accent)' : 'rgba(0,0,0,0.3)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <CheckCircle size={18} /> Historial Completo
        </button>
      </div>

      {/* Filtros de Facturas SRI */}
      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', color: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desde:</label>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hasta:</label>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cliente:</label>
          <input type="text" placeholder="Buscar cliente..." value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No. Factura/ID:</label>
          <input type="text" placeholder="Buscar número o clave..." value={filterInvoice} onChange={(e) => setFilterInvoice(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Estado:</label>
          <select value={filterSriState} onChange={(e) => setFilterSriState(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }}>
            <option value="">Todos</option>
            <option value="AUTORIZADO">Autorizada</option>
            <option value="PENDIENTE_ENVIO">Pendiente Envío</option>
            <option value="RECHAZADA">Rechazada</option>
            <option value="DEVUELTA">Devuelta</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterClient(''); setFilterInvoice(''); setFilterSriState(''); }} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Limpiar Filtros</button>
        </div>
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
                const saleDate = parseSaleDate(venta);
                const dateStr = saleDate ? `${saleDate.toLocaleDateString()} ${saleDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'S/F';
                const est = (venta.estadoSri || venta.status || 'PENDIENTE_ENVIO').toUpperCase();
                const isContingency = est !== 'AUTORIZADO' && est !== 'AUTORIZADA' && est !== 'NOTA_DE_VENTA';
                
                return (
                  <tr key={venta.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px' }}>{dateStr}</td>
                    <td style={{ padding: '12px' }}>{venta.numeroComprobante || 'S/N'}</td>
                    <td style={{ padding: '12px' }}>{venta.issuerName || 'GRAVITY DENIM'}</td>
                    <td style={{ padding: '12px' }}>{(venta.cliente || venta.customer)?.nombre || 'Consumidor Final'}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>${(venta.totals?.total || venta.total || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>
                      {renderStatusBadge(venta.estadoSri || venta.status)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {isContingency ? (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => setSelectedVenta(venta)}
                            style={{ padding: '6px 10px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            Ver
                          </button>
                          <button 
                            onClick={() => handleReenviar(venta)}
                            disabled={procesando}
                            style={{ padding: '6px 12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: procesando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <RefreshCw size={14} className={procesando ? "animate-spin" : ""} /> 
                            {procesando ? 'Enviando...' : 'Reenviar SRI'}
                          </button>
                        </div>
                       ) : (
                         <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                           <button 
                             onClick={() => setSelectedVenta(venta)}
                             style={{ padding: '6px 10px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                           >
                             Ver
                           </button>
                           <button 
                             onClick={() => handleReimprimirClick(venta)}
                             style={{ padding: '6px 10px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                           >
                             <Printer size={12} /> Reimprimir
                           </button>
                           <button 
                             onClick={() => window.open(`/api/sri/pdf?claveAcceso=${venta.claveAcceso || venta.id}`, '_blank')}
                             style={{ padding: '6px 10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                           >
                             PDF
                           </button>
                           <button 
                             onClick={() => window.open(`/api/sri/xml?claveAcceso=${venta.claveAcceso || venta.id}`, '_blank')}
                             style={{ padding: '6px 10px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                           >
                             XML
                           </button>
                         </div>
                       )}
                     </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
         )}
       </div>

       {/* Detalle Modal */}
       {selectedVenta && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
           <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'white' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
               <h3 style={{ margin: 0 }}>Detalle de Factura SRI</h3>
               <button onClick={() => setSelectedVenta(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1' }}>&times;</button>
             </div>

             <div style={{ fontSize: '0.9rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '1.5rem' }}>
               <div>
                 <h4 style={{ margin: '0 0 5px 0', color: 'var(--accent)' }}>Emisor</h4>
                 <div><b>Nombre/Razón Social:</b> {selectedVenta.issuerName || 'GRAVITY DENIM'}</div>
                 <div><b>RUC:</b> {selectedVenta.issuerRuc || '1803805405001'}</div>
               </div>
               <div>
                 <h4 style={{ margin: '0 0 5px 0', color: 'var(--accent)' }}>Cliente</h4>
                 <div><b>Nombre:</b> {(selectedVenta.cliente || selectedVenta.customer)?.nombre || 'CONSUMIDOR FINAL'}</div>
                 <div><b>RUC/CI:</b> {(selectedVenta.cliente || selectedVenta.customer)?.numeroIdentificacion || '9999999999999'}</div>
                 <div><b>Email:</b> {(selectedVenta.cliente || selectedVenta.customer)?.correo || 'N/A'}</div>
               </div>
             </div>

             <div style={{ marginBottom: '1.5rem' }}>
               <h4 style={{ margin: '0 0 8px 0', color: 'var(--accent)' }}>Productos</h4>
               <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                 <thead>
                   <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                     <th style={{ padding: '6px' }}>Cant</th>
                     <th style={{ padding: '6px' }}>Descripción</th>
                     <th style={{ padding: '6px', textAlign: 'right' }}>P.Unit</th>
                     <th style={{ padding: '6px', textAlign: 'right' }}>Total</th>
                   </tr>
                 </thead>
                 <tbody>
                   {(selectedVenta.productos || selectedVenta.items || []).map((p, idx) => (
                     <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                       <td style={{ padding: '6px' }}>{p.qty || p.cantidad || 1}</td>
                       <td style={{ padding: '6px' }}>{p.name || p.nombre}</td>
                       <td style={{ padding: '6px', textAlign: 'right' }}>${Number(p.price || p.precio || 0).toFixed(2)}</td>
                       <td style={{ padding: '6px', textAlign: 'right' }}>${((p.price || p.precio || 0) * (p.qty || p.cantidad || 1) - (p.descuento || 0)).toFixed(2)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>

             <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
               <div>
                 <div><b>Forma de Pago:</b> {selectedVenta.paymentMethod || 'EFECTIVO'}</div>
                 <div><b>Estado SRI:</b> <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{selectedVenta.status || selectedVenta.estadoSri}</span></div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div>Subtotal: ${(selectedVenta.totals?.subtotal || selectedVenta.subtotal || 0).toFixed(2)}</div>
                 <div>IVA (15%): ${(selectedVenta.totals?.ivaAmount || selectedVenta.ivaAmount || 0).toFixed(2)}</div>
                 <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--success)', marginTop: '4px' }}>Total: ${(selectedVenta.totals?.total || selectedVenta.total || 0).toFixed(2)}</div>
               </div>
             </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', fontSize: '0.82rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '4px' }}>🔍 Información y Diagnóstico SRI</div>
                <div><b>Estado Respuesta SRI:</b> <span style={{ color: selectedVenta.estadoSri === 'AUTORIZADO' ? '#34d399' : '#f87171', fontWeight: 'bold' }}>{selectedVenta.estadoRespuestaSRI || selectedVenta.estadoSri || selectedVenta.status || 'N/A'}</span></div>
                <div><b>Código Respuesta:</b> {selectedVenta.codigoRespuesta || (selectedVenta.mensajesSri?.[0]?.identificador) || 'N/A'}</div>
                <div><b>Mensaje Respuesta:</b> {selectedVenta.mensajeRespuesta || (selectedVenta.mensajesSri?.[0]?.mensaje) || selectedVenta.errorTecnico || 'N/A'}</div>
                <div><b>Información Adicional:</b> {selectedVenta.informacionAdicional || (selectedVenta.mensajesSri?.[0]?.informacionAdicional) || 'N/A'}</div>
                <div><b>SOAP Fault:</b> {selectedVenta.soapFault ? (typeof selectedVenta.soapFault === 'object' ? JSON.stringify(selectedVenta.soapFault) : String(selectedVenta.soapFault)) : 'Ninguno'}</div>
                <div><b>HTTP Status:</b> {selectedVenta.httpStatus || '200'}</div>
                <div style={{ marginTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                  <div><b>Clave Acceso:</b> {selectedVenta.claveAcceso || selectedVenta.id}</div>
                  <div><b>Número Autorización:</b> {selectedVenta.numeroAutorizacion || 'N/A'}</div>
                  <div><b>Fecha Autorización:</b> {selectedVenta.fechaAutorizacion || 'N/A'}</div>
                </div>
              </div>

             <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
               <button onClick={() => handleReimprimirClick(selectedVenta)} style={{ padding: '8px 16px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                 <Printer size={16} /> Reimprimir
               </button>
               <button onClick={() => window.open(`/api/sri/pdf?claveAcceso=${selectedVenta.claveAcceso || selectedVenta.id}`, '_blank')} style={{ padding: '8px 16px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '4px', cursor: 'pointer' }}>
                 Descargar PDF
               </button>
               <button onClick={() => window.open(`/api/sri/xml?claveAcceso=${selectedVenta.claveAcceso || selectedVenta.id}`, '_blank')} style={{ padding: '8px 16px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '4px', cursor: 'pointer' }}>
                 Descargar XML
               </button>
               <button onClick={() => setSelectedVenta(null)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', cursor: 'pointer' }}>
                 Cerrar
               </button>
             </div>
           </div>
         </div>
       )}
     </div>
  );
}
