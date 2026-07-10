import React, { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, DollarSign, Percent, Package, Users, Activity, FileText, Download, FileType2, FileCode2 } from 'lucide-react';
import { generarFacturaA4 } from '../../utils/generadorA4';

export default function ReportesDashboard({ sales, issuers }) {
  // Procesar datos para el mes actual y el día de hoy
  const { currentMonthTotal, currentMonthIVA, salesByIssuer, topProducts, todayTotal, todayEfectivo, todayTransferencia, monthEfectivo, monthTransferencia, todayTransferDetails, monthTransferDetails } = useMemo(() => {
    let currentMonthTotal = 0;
    let currentMonthIVA = 0;
    let todayTotal = 0;
    let todayEfectivo = 0;
    let todayTransferencia = 0;
    let monthEfectivo = 0;
    let monthTransferencia = 0;
    const todayTransferDetails = { 'Edgar': 0, 'Amparito': 0, 'Junior': 0, 'Diana': 0, 'Otro': 0 };
    const monthTransferDetails = { 'Edgar': 0, 'Amparito': 0, 'Junior': 0, 'Diana': 0, 'Otro': 0 };
    const issuerTotals = {};
    const productSales = {};

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentDate = now.getDate();

    sales.forEach(sale => {
      // Parsear fecha (Firestore Timestamp o Date o String ISO)
      const rawDate = sale.date || sale.fechaTransaccion;
      if (!rawDate) return; // Saltar si no tiene ninguna de las dos

      const saleDate = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
      const isCurrentMonth = saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
      const isToday = isCurrentMonth && saleDate.getDate() === currentDate;

      const total = sale.totals?.total || 0;
      const iva = sale.totals?.ivaAmount || 0;
      const method = sale.paymentMethod || 'EFECTIVO';

      if (isCurrentMonth) {
        currentMonthTotal += total;
        currentMonthIVA += iva;
        if (method === 'EFECTIVO') {
          monthEfectivo += total;
        } else {
          monthTransferencia += total;
          const recipient = sale.transferRecipient;
          if (recipient && monthTransferDetails[recipient] !== undefined) {
            monthTransferDetails[recipient] += total;
          } else {
            monthTransferDetails['Otro'] += total;
          }
        }
      }

      if (isToday) {
        todayTotal += total;
        if (method === 'EFECTIVO') {
          todayEfectivo += total;
        } else {
          todayTransferencia += total;
          const recipient = sale.transferRecipient;
          if (recipient && todayTransferDetails[recipient] !== undefined) {
            todayTransferDetails[recipient] += total;
          } else {
            todayTransferDetails['Otro'] += total;
          }
        }
      }

      // Tabla multi-RUC (Acumulado general o mensual, lo haremos general)
      const issuerId = sale.issuerId || 'Desconocido';
      if (!issuerTotals[issuerId]) {
        issuerTotals[issuerId] = {
          name: sale.issuerName || issuerId,
          total: 0,
          ventas: 0
        };
      }
      issuerTotals[issuerId].total += total;
      issuerTotals[issuerId].ventas += 1;

      // Ranking de productos (Solo para el mes actual)
      if (isCurrentMonth && (sale.productos || sale.items || []) && Array.isArray((sale.productos || sale.items || []))) {
        (sale.productos || sale.items || []).forEach(item => {
          if (!productSales[item.name]) {
            productSales[item.name] = { name: item.name, qty: 0, revenue: 0 };
          }
          productSales[item.name].qty += item.qty;
          productSales[item.name].revenue += (item.price * item.qty);
        });
      }
    });

    return { 
      currentMonthTotal, 
      currentMonthIVA, 
      todayTotal,
      todayEfectivo,
      todayTransferencia,
      monthEfectivo,
      monthTransferencia,
      todayTransferDetails,
      monthTransferDetails,
      salesByIssuer: Object.values(issuerTotals).sort((a, b) => b.total - a.total), 
      topProducts: Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5)
    };
  }, [sales]);

  const [activeTab, setActiveTab] = useState('sri');

  const exportToCSV = () => {
    // 1. Definir las cabeceras requeridas por el ATS / Contador (incluye datos extra de cliente)
    const headers = [
      "Fecha de Emisión",
      "Tipo Comprobante",
      "RUC Emisor",
      "Emisor",
      "Identificación Cliente",
      "Nombre Cliente",
      "Email Cliente",
      "Teléfono Cliente",
      "Dirección Cliente",
      "Base Imponible 15%",
      "Base Imponible 0%",
      "Monto IVA 15%",
      "Valor Total",
      "Clave de Acceso",
      "Método de Pago"
    ];

    // 2. Ordenar las ventas por nombre de emisor (para agruparlas)
    const sortedSales = [...sales].sort((a, b) => {
      const emisorA = a.issuerName || '';
      const emisorB = b.issuerName || '';
      return emisorA.localeCompare(emisorB);
    });

    const finalRows = [];
    let currentEmisor = null;

    sortedSales.forEach(sale => {
      const issuer = issuers?.find(i => i.id === sale.issuerId) || {};
      const emisorNombre = sale.issuerName || 'Desconocido';

      // Inyectar fila separadora visual en el CSV si cambiamos de hermano/emisor
      if (currentEmisor !== emisorNombre) {
        finalRows.push(`"--- VENTAS DE: ${emisorNombre.toUpperCase()} ---",,,,,,,,,,,,,`);
        currentEmisor = emisorNombre;
      }

      const saleDate = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
      const fechaFormat = saleDate.toLocaleDateString('es-EC'); // dd/mm/yyyy
      
      const rucEmisor = issuer.ruc || sale.issuerId;
      
      const idCliente = (sale.cliente || sale.customer)?.numeroIdentificacion || '9999999999999';
      const nombreCliente = (sale.cliente || sale.customer)?.nombre || 'CONSUMIDOR FINAL';
      const emailCliente = (sale.cliente || sale.customer)?.correo || 'N/A';
      const telefonoCliente = (sale.cliente || sale.customer)?.telefono || 'N/A';
      const direccionCliente = (sale.cliente || sale.customer)?.direccion || 'N/A';
      
      const base15 = (sale.totals?.baseImponible || 0).toFixed(2);
      const base0 = "0.00"; // Gravity Denim solo vende ropa con IVA
      const iva = (sale.totals?.ivaAmount || 0).toFixed(2);
      const total = (sale.totals?.total || 0).toFixed(2);
      
      const claveAcceso = sale.id || 'N/A';
      const metodoPago = sale.paymentMethod || 'EFECTIVO';

      // Envolver en comillas para evitar problemas con las comas en los textos
      finalRows.push([
        `"${fechaFormat}"`,
        `"${sale.status === 'NOTA_DE_VENTA' ? 'Nota Venta' : 'Factura'}"`, 
        `"${rucEmisor}"`,
        `"${emisorNombre}"`,
        `"${idCliente}"`,
        `"${nombreCliente}"`,
        `"${emailCliente}"`,
        `"${telefonoCliente}"`,
        `"${direccionCliente}"`,
        `"${base15}"`,
        `"${base0}"`,
        `"${iva}"`,
        `"${total}"`,
        `"${claveAcceso}"`,
        `"${metodoPago}"`
      ].join(","));
    });

    // 3. Unir cabeceras y filas con salto de línea
    const csvContent = headers.join(",") + "\n" + finalRows.join("\n");

    // 4. Crear un Blob y forzar la descarga en el navegador
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" }); // \ufeff es BOM para UTF-8 en Excel
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Ventas_Gravity_Denim_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="report-container animate-fade-in" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2><Activity className="inline" style={{verticalAlign: 'bottom'}}/> Dashboard de Reportes</h2>
          <span style={{color: 'var(--text-muted)'}}>Inteligencia Multi-RUC y Rendimiento</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => setActiveTab('sri')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'sri' ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Reportes SRI
          </button>
          <button 
            onClick={() => setActiveTab('internos')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'internos' ? '#10b981' : 'transparent', border: '1px solid #10b981', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Detallados Internos
          </button>
        </div>
      </div>

      {activeTab === 'sri' && (
        <>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* KPI: Recaudación Mes */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '15px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '50%', color: '#3b82f6' }}>
            <DollarSign size={32} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Recaudación Mes Actual</p>
            <h3 style={{ fontSize: '1.8rem', margin: 0 }}>${currentMonthTotal.toFixed(2)}</h3>
          </div>
        </div>

        {/* KPI: IVA Acumulado */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '15px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '50%', color: '#ef4444' }}>
            <Percent size={32} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>IVA Acumulado (15%) SRI</p>
            <h3 style={{ fontSize: '1.8rem', margin: 0 }}>${currentMonthIVA.toFixed(2)}</h3>
          </div>
        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        
        {/* Reporte de Ventas Estilo Ecufac */}
        <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid var(--accent)', paddingBottom: '10px' }}>
            <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.2rem' }}>Reporte de ventas</h3>
          </div>
          
          <div style={{ minWidth: '1000px' }}>
            <table className="pos-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                  <th>EMISION</th>
                  <th>AUTORIZACION</th>
                  <th>EST</th>
                  <th>PEM</th>
                  <th>NUM</th>
                  <th>CLIENTE</th>
                  <th>DOC</th>
                  <th>ST 0</th>
                  <th>ST IVA</th>
                  <th>IVA</th>
                  <th>TOTAL</th>
                  <th>ESTADO</th>
                  <th>CLAVE ACCESO/AUTORIZACION</th>
                </tr>
              </thead>
              <tbody>
                {sales.filter(s => s.status !== 'NOTA_DE_VENTA').sort((a,b) => new Date(b.date?.toDate ? b.date.toDate() : b.date) - new Date(a.date?.toDate ? a.date.toDate() : a.date)).map((sale, idx) => {
                  const saleDate = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
                  const isAutorizado = sale.status === 'AUTORIZADO';
                  const issuer = issuers?.find(i => i.id === sale.issuerId) || {};
                  
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td>{saleDate.toLocaleDateString('sv-SE')}</td>
                      <td>{isAutorizado ? saleDate.toLocaleString('sv-SE', {hour12: false}) : ''}</td>
                      <td>{issuer.establecimiento || '001'}</td>
                      <td>{issuer.puntoEmision || '100'}</td>
                      <td style={{ background: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', margin: '4px' }}>
                        {sale.numeroComprobante ? sale.numeroComprobante.split('-')[2] : (sale.secuencial || '000')}
                      </td>
                      <td>{(sale.cliente || sale.customer)?.nombre || 'CONSUMIDOR FINAL'}</td>
                      <td>{(sale.cliente || sale.customer)?.numeroIdentificacion || '9999999999999'}</td>
                      <td className="text-right">0.00</td>
                      <td className="text-right">{(sale.totals?.baseImponible || 0).toFixed(2)}</td>
                      <td className="text-right">{(sale.totals?.ivaAmount || 0).toFixed(2)}</td>
                      <td className="text-right font-bold">{(sale.totals?.total || 0).toFixed(2)}</td>
                      <td style={{ color: isAutorizado ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                        {sale.status}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.7rem' }}>{sale.claveAcceso || sale.id}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                              onClick={() => generarFacturaA4(sale, issuer)}
                              style={{ background: '#10b981', border: 'none', padding: '4px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                              title="Descargar PDF (RIDE A4)"
                            >
                              <FileText size={14} />
                            </button>
                            <button 
                              style={{ background: '#ef4444', border: 'none', padding: '4px', borderRadius: '4px', color: 'white', cursor: 'pointer', opacity: 0.7 }}
                              title="Descargar XML"
                            >
                              <FileCode2 size={14} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Reporte de Notas de Venta */}
        <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto', borderTop: '4px solid var(--warning)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid var(--warning)', paddingBottom: '10px' }}>
            <h3 style={{ color: 'var(--warning)', margin: 0, fontSize: '1.2rem' }}>Control Interno (Notas de Venta)</h3>
          </div>
          
          <div style={{ minWidth: '1000px' }}>
            <table className="pos-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                  <th>EMISION</th>
                  <th>EST</th>
                  <th>PEM</th>
                  <th>NUM</th>
                  <th>CLIENTE</th>
                  <th>DOC</th>
                  <th>ST 0</th>
                  <th>TOTAL</th>
                  <th>ESTADO</th>
                  <th>REFERENCIA INTERNA</th>
                </tr>
              </thead>
              <tbody>
                {sales.filter(s => s.status === 'NOTA_DE_VENTA').sort((a,b) => new Date(b.date?.toDate ? b.date.toDate() : b.date) - new Date(a.date?.toDate ? a.date.toDate() : a.date)).map((sale, idx) => {
                  const saleDate = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
                  const issuer = issuers?.find(i => i.id === sale.issuerId) || {};
                  
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td>{saleDate.toLocaleDateString('sv-SE')}</td>
                      <td>{issuer.establecimiento || '001'}</td>
                      <td>{issuer.puntoEmision || '100'}</td>
                      <td style={{ background: 'var(--warning)', color: 'white', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', margin: '4px' }}>
                        {sale.numeroComprobante || 'S/N'}
                      </td>
                      <td>{(sale.cliente || sale.customer)?.nombre || 'CONSUMIDOR FINAL'}</td>
                      <td>{(sale.cliente || sale.customer)?.numeroIdentificacion || '9999999999999'}</td>
                      <td className="text-right">{(sale.totals?.baseImponible || 0).toFixed(2)}</td>
                      <td className="text-right font-bold" style={{ color: 'var(--warning)' }}>{(sale.totals?.total || 0).toFixed(2)}</td>
                      <td style={{ color: 'var(--warning)', fontWeight: 'bold' }}>
                        {sale.status}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.7rem' }}>{sale.claveAcceso || sale.id}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                              onClick={() => generarFacturaA4(sale, issuer)}
                              style={{ background: '#10b981', border: 'none', padding: '4px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                              title="Descargar Comprobante A4"
                            >
                              <FileText size={14} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      </>
      )}

      {activeTab === 'internos' && (
        <>
        {/* Métricas de Hoy y Mes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          
          <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Ventas de Hoy</p>
            <h3 style={{ fontSize: '2rem', margin: 0, color: 'var(--text-main)' }}>${todayTotal.toFixed(2)}</h3>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: '#10b981' }}>💵 Efec: ${todayEfectivo.toFixed(2)}</span>
              <span style={{ color: '#3b82f6', marginLeft: '10px' }}>🏦 Transf: ${todayTransferencia.toFixed(2)}</span>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Ventas del Mes</p>
            <h3 style={{ fontSize: '2rem', margin: 0, color: 'var(--text-main)' }}>${currentMonthTotal.toFixed(2)}</h3>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: '#10b981' }}>💵 Efec: ${monthEfectivo.toFixed(2)}</span>
              <span style={{ color: '#3b82f6', marginLeft: '10px' }}>🏦 Transf: ${monthTransferencia.toFixed(2)}</span>
            </div>
          </div>

        </div>

        {/* Resumen Detallado de Transferencias */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#3b82f6', margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Detalle Transferencias (Hoy)</h3>
            {['Edgar', 'Amparito', 'Junior', 'Diana', 'Otro'].map(name => todayTransferDetails[name] > 0 && (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.2rem' }}>
                <span style={{ color: 'var(--text-main)' }}>{name}</span>
                <span style={{ fontWeight: 'bold' }}>${todayTransferDetails[name].toFixed(2)}</span>
              </div>
            ))}
            {Object.values(todayTransferDetails).every(v => v === 0) && (
              <span style={{ color: 'var(--text-muted)' }}>No hay transferencias hoy</span>
            )}
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#3b82f6', margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Detalle Transferencias (Mes)</h3>
            {['Edgar', 'Amparito', 'Junior', 'Diana', 'Otro'].map(name => monthTransferDetails[name] > 0 && (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.2rem' }}>
                <span style={{ color: 'var(--text-main)' }}>{name}</span>
                <span style={{ fontWeight: 'bold' }}>${monthTransferDetails[name].toFixed(2)}</span>
              </div>
            ))}
            {Object.values(monthTransferDetails).every(v => v === 0) && (
              <span style={{ color: 'var(--text-muted)' }}>No hay transferencias este mes</span>
            )}
          </div>

        </div>

        {/* Ranking de Productos del Mes */}
        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem' }}>
          <h3 style={{ color: 'var(--accent)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={20} /> Ranking Top Productos (Este Mes)
          </h3>
          {topProducts.length > 0 ? (
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Prenda / Jean</th>
                  <th>Unidades Vendidas</th>
                  <th>Ingresos Generados</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, idx) => (
                  <tr key={idx}>
                    <td>{product.name}</td>
                    <td>{product.qty} prendas</td>
                    <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>${product.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
             <p style={{ color: 'var(--text-muted)' }}>No hay prendas vendidas este mes aún.</p>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <FileText size={20} /> Historial Detallado de Transacciones
            </h3>
            <button 
              onClick={exportToCSV}
              className="btn-success" 
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
            >
              <Download size={16} /> Exportar Excel (CSV)
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="pos-table" style={{ minWidth: '800px' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Emisor</th>
                  <th>Cliente</th>
                  <th>Clave de Acceso / ID</th>
                  <th>Cant. Prendas</th>
                  <th>Método Pago</th>
                  <th>Subtotal</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.sort((a,b) => new Date(b.date?.toDate ? b.date.toDate() : b.date) - new Date(a.date?.toDate ? a.date.toDate() : a.date)).map((sale, idx) => {
                  const saleDate = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
                  const itemsQty = (sale.productos || sale.items || []) ? (sale.productos || sale.items || []).reduce((acc, item) => acc + item.qty, 0) : 0;
                  return (
                    <tr key={idx}>
                      <td>{saleDate.toLocaleString()}</td>
                      <td>{sale.issuerName || sale.issuerId}</td>
                      <td>{(sale.cliente || sale.customer)?.nombre || 'Consumidor Final'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sale.id}</td>
                      <td>{itemsQty}</td>
                      <td style={{ fontSize: '0.85rem', color: sale.paymentMethod === 'TRANSFERENCIA' ? '#3b82f6' : '#10b981' }}>
                        {sale.paymentMethod || 'EFECTIVO'}
                      </td>
                      <td>${(sale.totals?.subtotal || 0).toFixed(2)}</td>
                      <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>${(sale.totals?.total || 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay transacciones registradas</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

    </div>
  );
}
