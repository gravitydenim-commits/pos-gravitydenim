import React, { useMemo } from 'react';
import { LayoutDashboard, Wallet, ReceiptText } from 'lucide-react';

export default function DailyReport({ issuers, sales }) {

  // Procesamiento de datos: Agrupar ventas por emisor (hermano)
  const reportData = useMemo(() => {
    return issuers.map(issuer => {
      const issuerSales = sales.filter(s => s.issuerId === issuer.id);
      const sriSales = issuerSales.filter(s => s.status !== 'NOTA_DE_VENTA');
      const notaVentaSales = issuerSales.filter(s => s.status === 'NOTA_DE_VENTA');

      const totalAmount = issuerSales.reduce((acc, sale) => acc + sale.totals.total, 0);
      const totalSRI = sriSales.reduce((acc, sale) => acc + sale.totals.total, 0);
      const totalNV = notaVentaSales.reduce((acc, sale) => acc + sale.totals.total, 0);

      const totalIVA = sriSales.reduce((acc, sale) => acc + sale.totals.ivaAmount, 0);
      const sriItemsCount = sriSales.reduce((acc, sale) => {
        return acc + sale.items.reduce((sum, item) => sum + item.qty, 0);
      }, 0);
      
      const nvItemsCount = notaVentaSales.reduce((acc, sale) => {
        return acc + sale.items.reduce((sum, item) => sum + item.qty, 0);
      }, 0);

      return {
        ...issuer,
        salesCount: sriSales.length,
        nvCount: notaVentaSales.length,
        sriItemsCount,
        nvItemsCount,
        totalAmount,
        totalSRI,
        totalNV,
        totalIVA
      };
    });
  }, [issuers, sales]);

  const totalGlobal = reportData.reduce((acc, data) => acc + data.totalAmount, 0);

  return (
    <div className="report-container animate-fade-in" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2><LayoutDashboard className="inline" style={{verticalAlign: 'bottom'}}/> Reporte de Ventas (Cierre de Caja)</h2>
        <span style={{color: 'var(--text-muted)'}}>{new Date().toLocaleDateString()}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        
        {reportData.map(data => (
          <React.Fragment key={data.id}>
            {/* TARJETA FACTURAS (SRI) */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderTop: '4px solid var(--accent)' }}>
              <h3 style={{ color: 'var(--accent)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wallet size={20} /> {data.name} <span style={{ fontSize: '0.8rem', padding: '2px 6px', background: 'var(--accent)', color: 'white', borderRadius: '4px' }}>SRI</span>
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>RUC: {data.ruc}</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Facturas Emitidas:</span>
                <span style={{ fontWeight: 'bold' }}>{data.salesCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Prendas Vendidas:</span>
                <span style={{ fontWeight: 'bold' }}>{data.sriItemsCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>IVA Recaudado:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>${data.totalIVA.toFixed(2)}</span>
              </div>
              
              <hr style={{ borderColor: 'var(--panel-border)', margin: '1rem 0' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
                <span>Total Facturado:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>${data.totalSRI.toFixed(2)}</span>
              </div>
            </div>

            {/* TARJETA NOTAS DE VENTA */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderTop: '4px solid var(--warning)' }}>
              <h3 style={{ color: 'var(--warning)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wallet size={20} /> {data.name} <span style={{ fontSize: '0.8rem', padding: '2px 6px', background: 'var(--warning)', color: 'white', borderRadius: '4px' }}>Interno</span>
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>RUC: {data.ruc} (No tributario)</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Notas de Venta:</span>
                <span style={{ fontWeight: 'bold' }}>{data.nvCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Prendas Vendidas:</span>
                <span style={{ fontWeight: 'bold' }}>{data.nvItemsCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>IVA Recaudado:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>$0.00</span>
              </div>
              
              <hr style={{ borderColor: 'var(--panel-border)', margin: '1rem 0' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
                <span>Total Notas Venta:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--warning)' }}>${data.totalNV.toFixed(2)}</span>
              </div>
            </div>
          </React.Fragment>
        ))}

      </div>

      {/* Global Summary */}
      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(59, 130, 246, 0.1)', borderColor: 'var(--accent)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ReceiptText size={24} /> Total Local (Todos los Hermanos)
        </h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '1rem', color: 'var(--text-main)' }}>
          ${totalGlobal.toFixed(2)}
        </p>
      </div>

    </div>
  );
}
