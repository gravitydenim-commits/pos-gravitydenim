import React, { useMemo } from 'react';
import { LayoutDashboard, Wallet, ReceiptText } from 'lucide-react';

export default function DailyReport({ issuers, sales }) {

  // Procesamiento de datos: Agrupar ventas por emisor (hermano)
  const reportData = useMemo(() => {
    return issuers.map(issuer => {
      const issuerSales = sales.filter(s => {
        const est = (s.estadoSri || s.status || s.estado || '').toUpperCase();
        const isInvalid = est === 'ERROR_DUPLICADO' || est === 'REVERTIDA_NC' || est === 'ANULADA_SRI' || est === 'ANULADA' || est === 'ANULADO' || s.notaCreditoEmitida === true || s.isNotaCredito === true || s.tipoComprobante === 'NOTA_CREDITO';
        return s.issuerId === issuer.id && !isInvalid;
      });
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
    <div className="report-container animate-fade-in" style={{ padding: '1.5rem', background: '#0e0f14', borderRadius: '16px' }}>
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#f1f5f9', fontWeight: 'bold', fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LayoutDashboard size={24} color="#0a84ff" /> Reporte de Ventas (Cierre de Caja)
        </h2>
        <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>{new Date().toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>

      {/* SECCIÓN SRI */}
      <h3 style={{ marginTop: '1rem', marginBottom: '1rem', color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', fontSize: '1.1rem', fontWeight: '700' }}>
        Facturación Electrónica (SRI)
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {reportData.map(data => (
            <div key={`sri-${data.id}`} style={{ padding: '1.4rem', background: '#1a1b22', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', borderTop: '4px solid #0a84ff', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
              <h3 style={{ color: '#0a84ff', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                <Wallet size={18} /> {data.name} <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(10, 132, 255, 0.15)', color: '#60a5fa', border: '1px solid rgba(10, 132, 255, 0.3)', borderRadius: '6px', fontWeight: '700' }}>SRI</span>
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '1rem' }}>RUC: {data.ruc}</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>Facturas Emitidas:</span>
                <span style={{ fontWeight: 'bold' }}>{data.salesCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>Prendas Vendidas:</span>
                <span style={{ fontWeight: 'bold' }}>{data.sriItemsCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>IVA Recaudado:</span>
                <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>${data.totalIVA.toFixed(2)}</span>
              </div>
              
              <hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '0.9rem 0' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem' }}>
                <span style={{ color: '#f1f5f9', fontWeight: '600' }}>Total Facturado:</span>
                <span style={{ fontWeight: 'bold', color: '#30d158' }}>${data.totalSRI.toFixed(2)}</span>
              </div>
            </div>
        ))}
      </div>

      {/* SECCIÓN NOTAS DE VENTA */}
      <h3 style={{ marginTop: '2.5rem', marginBottom: '1rem', color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', fontSize: '1.1rem', fontWeight: '700' }}>
        Control Interno (Notas de Venta)
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {reportData.map(data => (
            <div key={`nv-${data.id}`} style={{ padding: '1.4rem', background: '#1a1b22', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', borderTop: '4px solid #bf5af2', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
              <h3 style={{ color: '#c084fc', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                <Wallet size={18} /> {data.name} <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(191, 90, 242, 0.15)', color: '#c084fc', border: '1px solid rgba(191, 90, 242, 0.3)', borderRadius: '6px', fontWeight: '700' }}>Interno</span>
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '1rem' }}>RUC: {data.ruc} (No tributario)</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>Notas de Venta:</span>
                <span style={{ fontWeight: 'bold' }}>{data.nvCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>Prendas Vendidas:</span>
                <span style={{ fontWeight: 'bold' }}>{data.nvItemsCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>IVA Recaudado:</span>
                <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>$0.00</span>
              </div>
              
              <hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '0.9rem 0' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem' }}>
                <span style={{ color: '#f1f5f9', fontWeight: '600' }}>Total Notas Venta:</span>
                <span style={{ fontWeight: 'bold', color: '#c084fc' }}>${data.totalNV.toFixed(2)}</span>
              </div>
            </div>
        ))}
      </div>

      {/* Global Summary */}
      <div style={{ marginTop: '2.5rem', padding: '1.5rem', background: '#181920', border: '1px solid rgba(10, 132, 255, 0.25)', borderRadius: '14px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#0a84ff', margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
          <ReceiptText size={22} /> Total Local (Todos los Hermanos)
        </h3>
        <p style={{ fontSize: '2.2rem', fontWeight: 'bold', marginTop: '0.75rem', marginBottom: 0, color: '#f1f5f9' }}>
          ${totalGlobal.toFixed(2)}
        </p>
      </div>

    </div>
  );
}
