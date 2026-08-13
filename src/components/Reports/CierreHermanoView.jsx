import React, { useState, useEffect, useMemo } from 'react';

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

export default function CierreHermanoView({ sales }) {
  const [users, setUsers] = useState([]);
  const [selectedSiblingId, setSelectedSiblingId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { getDocs, collection } = await import('firebase/firestore');
        const { db } = await import('../../firebase/config');
        const snap = await getDocs(collection(db, 'users'));
        setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error loading users in CierreHermanoView:", err);
      }
    };
    fetchUsers();
  }, []);

  const siblingProfiles = useMemo(() => {
    const list = [
      { id: 'Edgar', name: 'Edgar', dbKeys: ['edgar'] },
      { id: 'Amparito', name: 'Amparito', dbKeys: ['amparito'] },
      { id: 'Fabian', name: 'Fabian (Domingo Sánchez)', dbKeys: ['domingo', 'fabian', 'junior', 'sanchez'] },
      { id: 'Diana', name: 'Diana (Esposa de Fabian)', dbKeys: ['diana'] }
    ];
    return list.map(item => {
      const matchedUser = users.find(u => {
        const uName = (u.name || '').toLowerCase();
        return item.dbKeys.some(k => uName.includes(k));
      });
      return {
        ...item,
        firebaseId: matchedUser ? matchedUser.id : item.id,
        firebaseName: matchedUser ? matchedUser.name : item.name
      };
    });
  }, [users]);

  // Filtrar ventas por fecha (excluyendo revertidas con NC y notas de crédito)
  const salesInDateRange = useMemo(() => {
    return sales.filter(sale => {
      const est = (sale.estadoSri || sale.status || '').toUpperCase();
      const isReverted = est === 'REVERTIDA_NC' || est === 'ANULADA_SRI' || est === 'ANULADA' || est === 'ANULADO' || sale.notaCreditoEmitida === true;
      const isNC = sale.isNotaCredito || sale.tipoComprobante === 'NOTA_CREDITO' || sale.estadoVenta === 'NOTA_CREDITO';
      const isDuplicated = est === 'ERROR_DUPLICADO' || est === 'REEMPLAZADO';
      if (isReverted || isNC || isDuplicated) return false;

      const saleDate = parseSaleDate(sale);
      if (!saleDate) return false;
      const dateStr = saleDate.toISOString().split('T')[0];
      if (dateFrom && dateStr < dateFrom) return false;
      if (dateTo && dateStr > dateTo) return false;
      return true;
    });
  }, [sales, dateFrom, dateTo]);

  // Cálculos de compensación y desglose para el hermano seleccionado o general
  const siblingData = useMemo(() => {
    if (!selectedSiblingId) return null;
    
    if (selectedSiblingId === 'Todos') {
      let ventasPropiasTotal = 0;
      let ventasPropiasCantidad = 0;
      let ventasPropiasEfectivo = 0;
      let ventasPropiasTransferencias = 0;
      const ventasPropiasDetalle = [];

      const compensations = {};
      siblingProfiles.forEach(p => {
        compensations[p.firebaseId] = {
          brotherName: p.name,
          amountOwedToSibling: 0,
          amountSiblingOwesToUs: 0
        };
      });

      salesInDateRange.forEach(sale => {
        const items = sale.productos || sale.items || [];
        const totalItemsVal = items.reduce((acc, item) => acc + ((item.price || item.precio || 0) * (item.qty || 1) - (item.descuento || 0)), 0);
        if (totalItemsVal <= 0) return;

        const proportionVal = sale.totals?.total || sale.total || 0;
        ventasPropiasTotal += proportionVal;
        ventasPropiasCantidad += items.reduce((acc, i) => acc + (i.qty || 1), 0);

        const paymentDetails = sale.paymentDetails || {
          method: sale.paymentMethod || 'EFECTIVO',
          cashAmount: sale.paymentMethod === 'EFECTIVO' ? (sale.totals?.total || sale.total || 0) : 0,
          transfers: sale.paymentMethod === 'TRANSFERENCIA' ? [
            {
              recipientId: 'unknown',
              recipientName: sale.transferRecipient || 'Desconocido',
              amount: sale.totals?.total || sale.total || 0
            }
          ] : []
        };

        ventasPropiasEfectivo += paymentDetails.cashAmount || 0;
        const transfersPart = paymentDetails.transfers || [];
        transfersPart.forEach(t => {
          ventasPropiasTransferencias += t.amount || 0;
        });

        ventasPropiasDetalle.push({
          numeroVenta: sale.numeroComprobante || sale.id.substring(0, 8),
          cliente: (sale.cliente || sale.customer)?.nombre || 'Consumidor Final',
          productos: items.map(i => `${i.qty || 1}x ${i.name || i.nombre} (${i.ownerName || 'Sin Dueño'})`).join(', '),
          montoTotal: proportionVal
        });

        // Calcular compensación general entre hermanos
        transfersPart.forEach(t => {
          const recipientProfile = siblingProfiles.find(p => {
            if (t.recipientId && p.firebaseId === t.recipientId) return true;
            return t.recipientName && t.recipientName.toLowerCase().includes(p.id.toLowerCase());
          });
          const recipientId = recipientProfile ? recipientProfile.firebaseId : (t.recipientId || 'unknown');

          items.forEach(item => {
            const itemOwnerProfile = siblingProfiles.find(p => {
              if (item.ownerId && p.firebaseId === item.ownerId) return true;
              return item.ownerName && item.ownerName.toLowerCase().includes(p.id.toLowerCase());
            });
            const ownerId = itemOwnerProfile ? itemOwnerProfile.firebaseId : (item.ownerId || 'unknown');
            const itemVal = (item.price || item.precio || 0) * (item.qty || 1) - (item.descuento || 0);
            const itemProp = itemVal / totalItemsVal;
            const itemTransferAmount = itemProp * t.amount;

            if (recipientId !== ownerId) {
              if (compensations[recipientId]) {
                compensations[recipientId].amountSiblingOwesToUs += itemTransferAmount;
              }
              if (compensations[ownerId]) {
                compensations[ownerId].amountOwedToSibling += itemTransferAmount;
              }
            }
          });
        });
      });

      return {
        siblingName: 'Todos los Hermanos (Ventas Completas)',
        ventasPropiasTotal,
        ventasPropiasCantidad,
        ventasPropiasEfectivo,
        ventasPropiasTransferencias,
        ventasPropiasDetalle,
        transferenciasRecibidas: [],
        transferenciasPropiasEnOtrosHermanos: [],
        compensations
      };
    }

    const selectedProfile = siblingProfiles.find(p => p.id === selectedSiblingId);
    if (!selectedProfile) return null;

    // 1. Ventas de productos propios
    let ventasPropiasTotal = 0;
    let ventasPropiasCantidad = 0;
    let ventasPropiasEfectivo = 0;
    let ventasPropiasTransferencias = 0;
    const ventasPropiasDetalle = [];

    // 2. Transferencias recibidas en su cuenta
    const transferenciasRecibidas = [];

    // 3. Transferencias de su pertenencia recibidas por otros hermanos
    const transferenciasPropiasEnOtrosHermanos = [];

    // Matriz de saldos cruzados
    const compensations = {};
    siblingProfiles.forEach(p => {
      if (p.id !== selectedSiblingId) {
        compensations[p.firebaseId] = {
          brotherName: p.name,
          amountOwedToSibling: 0,
          amountSiblingOwesToUs: 0
        };
      }
    });

    salesInDateRange.forEach(sale => {
      const items = sale.productos || sale.items || [];
      const totalItemsVal = items.reduce((acc, item) => acc + ((item.price || item.precio || 0) * (item.qty || 1) - (item.descuento || 0)), 0);
      if (totalItemsVal <= 0) return;

      // Calcular lo vendido por el hermano seleccionado en esta venta
      const siblingItems = items.filter(item => {
        return item.ownerId === selectedProfile.firebaseId || 
               (item.ownerName && item.ownerName.toLowerCase().includes(selectedProfile.id.toLowerCase()));
      });
      const siblingItemsVal = siblingItems.reduce((acc, item) => acc + ((item.price || item.precio || 0) * (item.qty || 1) - (item.descuento || 0)), 0);
      
      // Proporción (incluyendo IVA proporcional)
      const proportion = siblingItemsVal / totalItemsVal;
      const proportionVal = proportion * (sale.totals?.total || sale.total || 0);

      // Si el hermano seleccionado es dueño de algo en esta venta
      if (siblingItemsVal > 0) {
        ventasPropiasTotal += proportionVal;
        ventasPropiasCantidad += siblingItems.reduce((acc, i) => acc + (i.qty || 1), 0);

        // Desglosar por método de pago
        const paymentDetails = sale.paymentDetails || {
          method: sale.paymentMethod || 'EFECTIVO',
          cashAmount: sale.paymentMethod === 'EFECTIVO' ? (sale.totals?.total || sale.total || 0) : 0,
          transfers: sale.paymentMethod === 'TRANSFERENCIA' ? [
            {
              recipientId: 'unknown',
              recipientName: sale.transferRecipient || 'Desconocido',
              amount: sale.totals?.total || sale.total || 0
            }
          ] : []
        };

        const cashPart = proportion * (paymentDetails.cashAmount || 0);
        ventasPropiasEfectivo += cashPart;

        const transfersPart = paymentDetails.transfers || [];
        transfersPart.forEach(t => {
          const tPart = proportion * (t.amount || 0);
          ventasPropiasTransferencias += tPart;

          // Si el destinatario de la transferencia es otro hermano
          const isOther = t.recipientId ? (t.recipientId !== selectedProfile.firebaseId) : (t.recipientName && !t.recipientName.toLowerCase().includes(selectedProfile.id.toLowerCase()));
          if (isOther) {
            // Buscar cuál de los otros hermanos recibió la transferencia
            const otherProfile = siblingProfiles.find(p => {
              if (t.recipientId && p.firebaseId === t.recipientId) return true;
              return t.recipientName && t.recipientName.toLowerCase().includes(p.id.toLowerCase());
            });
            const otherId = otherProfile ? otherProfile.firebaseId : (t.recipientId || 'unknown');
            const otherName = otherProfile ? otherProfile.name : (t.recipientName || 'Otro');

            transferenciasPropiasEnOtrosHermanos.push({
              recipientId: otherId,
              recipientName: otherName,
              amount: tPart,
              numeroVenta: sale.numeroComprobante || sale.id.substring(0, 8),
              cliente: (sale.cliente || sale.customer)?.nombre || 'Consumidor Final'
            });

            if (compensations[otherId]) {
              compensations[otherId].amountOwedToSibling += tPart;
            }
          }
        });

        ventasPropiasDetalle.push({
          numeroVenta: sale.numeroComprobante || sale.id.substring(0, 8),
          cliente: (sale.cliente || sale.customer)?.nombre || 'Consumidor Final',
          productos: siblingItems.map(i => `${i.qty || 1}x ${i.name || i.nombre}`).join(', '),
          montoTotal: proportionVal
        });
      }

      // Analizar transferencias recibidas por el hermano seleccionado
      const paymentDetails = sale.paymentDetails || {
        method: sale.paymentMethod || 'EFECTIVO',
        cashAmount: sale.paymentMethod === 'EFECTIVO' ? (sale.totals?.total || sale.total || 0) : 0,
        transfers: sale.paymentMethod === 'TRANSFERENCIA' ? [
          {
            recipientId: 'unknown',
            recipientName: sale.transferRecipient || 'Desconocido',
            amount: sale.totals?.total || sale.total || 0
          }
        ] : []
      };

      const transfersPart = paymentDetails.transfers || [];
      transfersPart.forEach(t => {
        // Si el hermano seleccionado recibió esta transferencia
        const receivedByUs = t.recipientId ? (t.recipientId === selectedProfile.firebaseId) : (t.recipientName && t.recipientName.toLowerCase().includes(selectedProfile.id.toLowerCase()));
        if (receivedByUs) {
          // Analizar a quién pertenecen los productos de esta transferencia
          items.forEach(item => {
            const itemOwnerProfile = siblingProfiles.find(p => {
              if (item.ownerId && p.firebaseId === item.ownerId) return true;
              return item.ownerName && item.ownerName.toLowerCase().includes(p.id.toLowerCase());
            });
            const itemOwnerId = itemOwnerProfile ? itemOwnerProfile.firebaseId : (item.ownerId || 'unknown');
            const itemOwnerName = itemOwnerProfile ? itemOwnerProfile.name : (item.ownerName || 'Otro Hermano');
            const itemVal = (item.price || item.precio || 0) * (item.qty || 1) - (item.descuento || 0);
            const itemProp = itemVal / totalItemsVal;
            const itemTransferAmount = itemProp * t.amount;

            // Si pertenece a otro hermano, le debemos entregar este dinero
            if (itemOwnerId !== selectedProfile.firebaseId) {
              transferenciasRecibidas.push({
                ownerId: itemOwnerId,
                ownerName: itemOwnerName,
                numeroVenta: sale.numeroComprobante || sale.id.substring(0, 8),
                cliente: (sale.cliente || sale.customer)?.nombre || 'Consumidor Final',
                amount: itemTransferAmount
              });

              if (compensations[itemOwnerId]) {
                compensations[itemOwnerId].amountSiblingOwesToUs += itemTransferAmount;
              }
            }
          });
        }
      });
    });

    return {
      siblingName: selectedProfile.name,
      ventasPropiasTotal,
      ventasPropiasCantidad,
      ventasPropiasEfectivo,
      ventasPropiasTransferencias,
      ventasPropiasDetalle,
      transferenciasRecibidas,
      transferenciasPropiasEnOtrosHermanos,
      compensations
    };
  }, [selectedSiblingId, salesInDateRange, siblingProfiles]);

  return (
    <div className="glass-panel" style={{ padding: '2rem', marginTop: '1rem', color: 'white' }}>
      <h3 style={{ color: '#f59e0b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📊 Cierre Diario por Hermano y Compensaciones
      </h3>

      {/* Selectores de Filtro */}
      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Seleccionar Hermano / Propietario:</label>
          <select 
            value={selectedSiblingId} 
            onChange={(e) => setSelectedSiblingId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontWeight: 'bold' }}
          >
            <option value="">Selecciona...</option>
            <option value="Todos">Todos los Hermanos / General</option>
            {siblingProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desde:</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: '7px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hasta:</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: '7px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
        </div>
      </div>

      {!selectedSiblingId ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          💡 Selecciona un hermano de la lista para ver su balance de cierre diario.
        </div>
      ) : siblingData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Fila de KPIs de Ventas Propias */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(34, 197, 94, 0.05)', borderLeft: '4px solid #22c55e' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 5px 0' }}>Total Vendido Propio</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0, color: '#22c55e' }}>${siblingData.ventasPropiasTotal.toFixed(2)}</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{siblingData.ventasPropiasCantidad} prendas vendidas</span>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderLeft: '4px solid rgba(255,255,255,0.1)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 5px 0' }}>Proporción Efectivo</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0 }}>${siblingData.ventasPropiasEfectivo.toFixed(2)}</h3>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '4px solid #3b82f6' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 5px 0' }}>Proporción Transferencias</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0, color: '#3b82f6' }}>${siblingData.ventasPropiasTransferencias.toFixed(2)}</h3>
            </div>
          </div>

          {/* Sección 1: Detalle de Ventas Propias */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ color: '#60a5fa', margin: '0 0 1rem 0' }}>📦 Detalle de prendas vendidas pertenecientes a {siblingData.siblingName}</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>No. Venta</th>
                    <th style={{ padding: '8px' }}>Cliente</th>
                    <th style={{ padding: '8px' }}>Detalle Prendas</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Monto Propio</th>
                  </tr>
                </thead>
                <tbody>
                  {siblingData.ventasPropiasDetalle.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px' }}>{v.numeroVenta}</td>
                      <td style={{ padding: '8px' }}>{v.cliente}</td>
                      <td style={{ padding: '8px', color: 'var(--text-main)' }}>{v.productos}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>${v.montoTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                  {siblingData.ventasPropiasDetalle.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>No se vendieron prendas de este hermano en el rango de fechas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sección 2: Transferencias recibidas en su cuenta (De otros hermanos) */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ color: '#a78bfa', margin: '0 0 1rem 0' }}>🏦 Transferencias recibidas en cuenta de {siblingData.siblingName} por productos de otros</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>No. Venta</th>
                    <th style={{ padding: '8px' }}>Cliente</th>
                    <th style={{ padding: '8px' }}>Dueño del Producto</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Monto Recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {siblingData.transferenciasRecibidas.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px' }}>{v.numeroVenta}</td>
                      <td style={{ padding: '8px' }}>{v.cliente}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{v.ownerName}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#a78bfa' }}>${v.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {siblingData.transferenciasRecibidas.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>No se recibieron transferencias ajenas en su cuenta.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sección 3: Transferencias propias en cuentas de otros hermanos */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ color: '#f59e0b', margin: '0 0 1rem 0' }}>🔀 Transferencias de productos de {siblingData.siblingName} recibidas en cuentas de otros</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>No. Venta</th>
                    <th style={{ padding: '8px' }}>Cliente</th>
                    <th style={{ padding: '8px' }}>Quién recibió la transferencia</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Monto a Recuperar</th>
                  </tr>
                </thead>
                <tbody>
                  {siblingData.transferenciasPropiasEnOtrosHermanos.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px' }}>{v.numeroVenta}</td>
                      <td style={{ padding: '8px' }}>{v.cliente}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{v.recipientName}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#f59e0b' }}>${v.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {siblingData.transferenciasPropiasEnOtrosHermanos.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>Ninguna transferencia propia fue recibida por otros hermanos.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sección 4: Tabla Resumen de Compensaciones */}
          <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ color: 'var(--success)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⚖️ Matriz de Compensaciones para {siblingData.siblingName}
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 8px' }}>Hermano</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Debe entregar a {siblingData.siblingName}</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>{siblingData.siblingName} debe entregarle</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Saldo Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(siblingData.compensations).map(([bId, comp]) => {
                    const net = comp.amountOwedToSibling - comp.amountSiblingOwesToUs;
                    let netColor = 'white';
                    let netText = `$${Math.abs(net).toFixed(2)}`;
                    if (net > 0) {
                      netColor = '#22c55e';
                      netText = `A favor: +${netText}`;
                    } else if (net < 0) {
                      netColor = '#ef4444';
                      netText = `En contra: -${netText}`;
                    } else {
                      netText = `$0.00`;
                    }

                    return (
                      <tr key={bId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold' }}>{comp.brotherName}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#22c55e' }}>${comp.amountOwedToSibling.toFixed(2)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ef4444' }}>${comp.amountSiblingOwesToUs.toFixed(2)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold', color: netColor }}>{netText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
}
