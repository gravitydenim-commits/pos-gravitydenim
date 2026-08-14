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
    <div style={{ padding: '1.5rem', background: '#0e0f14', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#f1f5f9' }}>
      <h3 style={{ color: '#f1f5f9', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.25rem', fontWeight: '700' }}>
        <span style={{ color: '#0a84ff' }}>📊</span> Cierre Diario por Hermano y Compensaciones
      </h3>

      {/* Selectores de Filtro */}
      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '2rem', background: '#181920', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '220px' }}>
          <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            👤 Seleccionar Hermano / Propietario:
          </label>
          <select 
            value={selectedSiblingId} 
            onChange={(e) => setSelectedSiblingId(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#121318', color: '#f1f5f9', fontWeight: 'bold', outline: 'none', fontSize: '0.88rem' }}
          >
            <option value="" style={{ background: '#121318' }}>Selecciona...</option>
            <option value="Todos" style={{ background: '#121318' }}>Todos los Hermanos / General</option>
            {siblingProfiles.map(p => (
              <option key={p.id} value={p.id} style={{ background: '#121318' }}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📅 Desde:</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#121318', color: '#f1f5f9', fontWeight: 'bold', outline: 'none', fontSize: '0.88rem' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📅 Hasta:</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#121318', color: '#f1f5f9', fontWeight: 'bold', outline: 'none', fontSize: '0.88rem' }} />
        </div>
      </div>

      {!selectedSiblingId ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          💡 Selecciona un hermano de la lista para ver su balance de cierre diario.
        </div>
      ) : siblingData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          {/* Fila de KPIs de Ventas Propias */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div style={{ padding: '1.25rem', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', borderLeft: '4px solid #30d158' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0 0 5px 0', textTransform: 'uppercase', fontWeight: '700' }}>Total Vendido Propio</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0, color: '#30d158', fontWeight: 'bold' }}>${siblingData.ventasPropiasTotal.toFixed(2)}</h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{siblingData.ventasPropiasCantidad} prendas vendidas</span>
            </div>

            <div style={{ padding: '1.25rem', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', borderLeft: '4px solid #f1f5f9' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0 0 5px 0', textTransform: 'uppercase', fontWeight: '700' }}>Proporción Efectivo</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0, color: '#f1f5f9', fontWeight: 'bold' }}>${siblingData.ventasPropiasEfectivo.toFixed(2)}</h3>
            </div>

            <div style={{ padding: '1.25rem', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', borderLeft: '4px solid #64d2ff' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0 0 5px 0', textTransform: 'uppercase', fontWeight: '700' }}>Proporción Transferencias</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0, color: '#64d2ff', fontWeight: 'bold' }}>${siblingData.ventasPropiasTransferencias.toFixed(2)}</h3>
            </div>
          </div>

          {/* Sección 1: Detalle de Ventas Propias */}
          <div style={{ padding: '1.25rem', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h4 style={{ color: '#60a5fa', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 'bold' }}>📦 Detalle de prendas vendidas pertenecientes a {siblingData.siblingName}</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: '#94a3b8', background: '#13141a' }}>
                    <th style={{ padding: '10px' }}>No. Venta</th>
                    <th style={{ padding: '10px' }}>Cliente</th>
                    <th style={{ padding: '10px' }}>Detalle Prendas</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Monto Propio</th>
                  </tr>
                </thead>
                <tbody>
                  {siblingData.ventasPropiasDetalle.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px', color: '#f1f5f9', fontWeight: 'bold' }}>{v.numeroVenta}</td>
                      <td style={{ padding: '10px', color: '#e2e8f0' }}>{v.cliente}</td>
                      <td style={{ padding: '10px', color: '#f1f5f9' }}>{v.productos}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#30d158' }}>${v.montoTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                  {siblingData.ventasPropiasDetalle.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>No se vendieron prendas de este hermano en el rango de fechas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sección 2: Transferencias recibidas en su cuenta (De otros hermanos) */}
          <div style={{ padding: '1.25rem', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h4 style={{ color: '#c084fc', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 'bold' }}>🏦 Transferencias recibidas en cuenta de {siblingData.siblingName} por productos de otros</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: '#94a3b8', background: '#13141a' }}>
                    <th style={{ padding: '10px' }}>No. Venta</th>
                    <th style={{ padding: '10px' }}>Cliente</th>
                    <th style={{ padding: '10px' }}>Dueño del Producto</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Monto Recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {siblingData.transferenciasRecibidas.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px', color: '#f1f5f9', fontWeight: 'bold' }}>{v.numeroVenta}</td>
                      <td style={{ padding: '10px', color: '#e2e8f0' }}>{v.cliente}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#f1f5f9' }}>{v.ownerName}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#c084fc' }}>${v.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {siblingData.transferenciasRecibidas.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>No se recibieron transferencias ajenas en su cuenta.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sección 3: Transferencias propias en cuentas de otros hermanos */}
          <div style={{ padding: '1.25rem', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h4 style={{ color: '#ff9f0a', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 'bold' }}>🔀 Transferencias de productos de {siblingData.siblingName} recibidas en cuentas de otros</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: '#94a3b8', background: '#13141a' }}>
                    <th style={{ padding: '10px' }}>No. Venta</th>
                    <th style={{ padding: '10px' }}>Cliente</th>
                    <th style={{ padding: '10px' }}>Quién recibió la transferencia</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Monto a Recuperar</th>
                  </tr>
                </thead>
                <tbody>
                  {siblingData.transferenciasPropiasEnOtrosHermanos.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px', color: '#f1f5f9', fontWeight: 'bold' }}>{v.numeroVenta}</td>
                      <td style={{ padding: '10px', color: '#e2e8f0' }}>{v.cliente}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#f1f5f9' }}>{v.recipientName}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#ff9f0a' }}>${v.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {siblingData.transferenciasPropiasEnOtrosHermanos.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>Ninguna transferencia propia fue recibida por otros hermanos.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sección 4: Tabla Resumen de Compensaciones */}
          <div style={{ padding: '1.25rem', background: '#181920', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h4 style={{ color: '#30d158', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem', fontWeight: 'bold' }}>
              ⚖️ Matriz de Compensaciones para {siblingData.siblingName}
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: '#94a3b8', background: '#13141a' }}>
                    <th style={{ padding: '10px' }}>Hermano</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Debe entregar a {siblingData.siblingName}</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>{siblingData.siblingName} debe entregarle</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Saldo Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(siblingData.compensations).map(([bId, comp]) => {
                    const net = comp.amountOwedToSibling - comp.amountSiblingOwesToUs;
                    let netColor = '#f1f5f9';
                    let netText = `$${Math.abs(net).toFixed(2)}`;
                    if (net > 0) {
                      netColor = '#30d158';
                      netText = `A favor: +${netText}`;
                    } else if (net < 0) {
                      netColor = '#ff453a';
                      netText = `En contra: -${netText}`;
                    } else {
                      netText = `$0.00`;
                    }

                    return (
                      <tr key={bId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#f1f5f9' }}>{comp.brotherName}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#30d158', fontWeight: 'bold' }}>${comp.amountOwedToSibling.toFixed(2)}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#ff453a', fontWeight: 'bold' }}>${comp.amountSiblingOwesToUs.toFixed(2)}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: netColor }}>{netText}</td>
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
