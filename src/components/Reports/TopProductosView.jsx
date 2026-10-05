import React, { useMemo } from 'react';

export default function TopProductosView({ sales }) {
  const topProducts = useMemo(() => {
    const productCounts = {};
    
    sales.forEach(sale => {
      if ((sale.status || sale.estado || '').toUpperCase() === 'ANULADA') return;
      if (sale.estadoSri === 'DEVUELTA' || sale.estadoSri === 'RECHAZADA') return;
      
      const items = sale.productos || sale.items || [];
      items.forEach(item => {
        const name = item.nombre || item.name || 'Desconocido';
        const qty = Number(item.cantidad || item.qty || 1);
        const total = Number(item.precioTotalSinImpuesto || (qty * (item.precioUnitario || item.price || 0)));
        
        if (!productCounts[name]) {
          productCounts[name] = { name, quantity: 0, totalRevenue: 0 };
        }
        productCounts[name].quantity += qty;
        productCounts[name].totalRevenue += total;
      });
    });
    
    return Object.values(productCounts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 20);
  }, [sales]);

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #ff9500', paddingBottom: '10px' }}>
        <h3 style={{ color: '#ff9500', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.3rem' }}>
          👕 Top 20 Prendas Más Vendidas
        </h3>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Basado en el rango de fechas seleccionado
        </span>
      </div>
      
      {topProducts.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No hay ventas en este período para generar el ranking.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--panel-border)' }}>
              <tr>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', width: '60px' }}>#</th>
                <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Prenda / Producto</th>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'right' }}>Cantidad Vendida</th>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'right' }}>Ingreso Generado (Subtotal)</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p, idx) => (
                <tr key={p.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.02)' } }}>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                  <td style={{ padding: '1rem', fontWeight: '500' }}>{p.name}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.1rem' }}>
                    {p.quantity}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', color: '#10b981', fontWeight: '500' }}>
                    ${p.totalRevenue.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
