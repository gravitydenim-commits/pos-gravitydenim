import React, { useMemo, useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Percent, Package, Users, Activity, FileText, Download, FileType2, FileCode2, Printer } from 'lucide-react';
import { generarFacturaA4 } from '../../utils/generadorA4';

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

export default function ReportesDashboard({ sales, issuers }) {
  const [filterDate, setFilterDate] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterSriState, setFilterSriState] = useState('');
  const [selectedVenta, setSelectedVenta] = useState(null);

  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      if (filterDate) {
        const saleDate = parseSaleDate(sale);
        if (!saleDate) return false;
        const formattedSaleDate = saleDate.toISOString().split('T')[0];
        if (formattedSaleDate !== filterDate) return false;
      }
      if (filterClient) {
        const clientName = ((sale.cliente || sale.customer)?.nombre || '').toLowerCase();
        if (!clientName.includes(filterClient.toLowerCase())) return false;
      }
      if (filterInvoice) {
        const invoiceNum = (sale.numeroComprobante || sale.claveAcceso || sale.id || '').toLowerCase();
        if (!invoiceNum.includes(filterInvoice.toLowerCase())) return false;
      }
      if (filterSriState) {
        const sriState = (sale.estadoSri || sale.status || 'PENDIENTE_ENVIO').toUpperCase();
        if (filterSriState === 'AUTORIZADO') {
          if (sriState !== 'AUTORIZADO' && sriState !== 'AUTORIZADA') return false;
        } else if (sriState !== filterSriState.toUpperCase()) {
          return false;
        }
      }
      return true;
    });
  }, [sales, filterDate, filterClient, filterInvoice, filterSriState]);

  const handleReimprimir = async (venta, format) => {
    try {
      const emisorId = venta.emisorId || venta.issuerId || 'hermano_geovanny';
      const emisorData = issuers?.find(i => i.id === emisorId) || { 
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
        venta.isNotaVenta || (venta.estadoSri === 'NOTA_DE_VENTA' || venta.status === 'NOTA_DE_VENTA'),
        format,
        true // isReprint = true
      );
    } catch (err) {
      alert("Error al reimprimir: " + err.message);
    }
  };

  const handleReimprimirClick = (venta) => {
    const estado = venta.estadoSri || venta.status;
    const isNota = (estado === 'NOTA_DE_VENTA');
    if (!isNota && estado !== 'AUTORIZADO' && estado !== 'AUTORIZADA') {
      alert(`⚠️ NO SE PUEDE REIMPRIMIR:\nEl comprobante no está autorizado por el SRI. Estado actual: ${estado || 'PENDIENTE'}`);
      return;
    }

    const choice = window.prompt(
      "Selecciona el formato de reimpresión:\n\n" +
      "1 - Ticket Térmico de 58 mm\n" +
      "2 - Ticket Térmico de 80 mm\n" +
      "3 - Descargar PDF\n\n" +
      "Ingresa el número de tu opción:",
      "2"
    );

    if (choice === "1") {
      handleReimprimir(venta, '58mm');
    } else if (choice === "2") {
      handleReimprimir(venta, '80mm');
    } else if (choice === "3") {
      window.open(`/api/sri/pdf?claveAcceso=${venta.claveAcceso || venta.id}`, '_blank');
    }
  };

  const handleImprimirReporteDelDia = async () => {
    // 1. Filtrar ventas de hoy
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentDate = now.getDate();

    const salesToday = sales.filter(sale => {
      const saleDate = parseSaleDate(sale);
      if (!saleDate) return false;
      return saleDate.getMonth() === currentMonth && 
             saleDate.getFullYear() === currentYear && 
             saleDate.getDate() === currentDate;
    });

    if (salesToday.length === 0) {
      alert("⚠️ No hay ventas registradas el día de hoy para imprimir.");
      return;
    }

    // 2. Obtener formato del operador
    const format = localStorage.getItem('printerFormat') || '80mm';
    const method = localStorage.getItem('printerMethod') || 'sistema';

    if (format === '58mm' && method === 'bluetooth_58') {
      try {
        const { printer58Service } = await import('../../lib/Printer58Service');
        
        let raw = printer58Service.cmds.INIT;
        raw += printer58Service.cmds.ALIGN_CENTER;
        raw += printer58Service.cmds.BOLD_ON;
        raw += printer58Service.cmds.DOUBLE_BOTH;
        raw += "GRAVITY DENIM" + printer58Service.cmds.FEED_LINE;
        raw += printer58Service.cmds.NORMAL_SIZE;
        raw += "REPORTE DE VENTAS DIARIAS" + printer58Service.cmds.FEED_LINE;
        raw += "Fecha: " + now.toLocaleDateString('es-EC') + printer58Service.cmds.FEED_LINE;
        raw += printer58Service.cmds.BOLD_OFF;
        raw += "--------------------------------" + printer58Service.cmds.FEED_LINE;
        
        let totalFacturas = 0;
        let totalNotas = 0;
        let totalEfectivo = 0;
        let totalTransf = 0;

        const facturasSales = salesToday.filter(s => !s.isNotaVenta && s.estadoSri !== 'NOTA_DE_VENTA' && s.status !== 'NOTA_DE_VENTA');
        const notasSales = salesToday.filter(s => s.isNotaVenta || s.estadoSri === 'NOTA_DE_VENTA' || s.status === 'NOTA_DE_VENTA');

        // Renderizar Facturas
        if (facturasSales.length > 0) {
          raw += printer58Service.cmds.ALIGN_CENTER;
          raw += printer58Service.cmds.BOLD_ON;
          raw += "=== FACTURAS ===" + printer58Service.cmds.FEED_LINE;
          raw += printer58Service.cmds.BOLD_OFF;
          raw += printer58Service.cmds.ALIGN_LEFT;

          facturasSales.forEach(sale => {
            const items = sale.productos || sale.items || [];
            const payMethod = (sale.paymentMethod || 'EFECTIVO').substring(0, 5);
            const cajero = (sale.cajeroNombre || sale.usuarioNombre || 'Edgar').substring(0, 6);
            const saleTot = sale.totals?.total || 0;
            totalFacturas += saleTot;

            if (payMethod === 'EFECTI') {
              totalEfectivo += saleTot;
            } else {
              totalTransf += saleTot;
            }

            items.forEach(item => {
              const qty = String(item.qty || item.cantidad || 1);
              const desc = printer58Service.normalizeText(item.name || item.nombre || 'Prenda').substring(0, 12).padEnd(12, ' ');
              const val = Number((item.qty || item.cantidad || 1) * (item.price || item.precio || 0));
              const valStr = "$" + val.toFixed(0);
              raw += `${qty} ${desc} ${valStr.padStart(4, ' ')} ${payMethod}/${cajero}` + printer58Service.cmds.FEED_LINE;
            });
          });
          raw += "--------------------------------" + printer58Service.cmds.FEED_LINE;
        }

        // Renderizar Notas de Venta
        if (notasSales.length > 0) {
          raw += printer58Service.cmds.ALIGN_CENTER;
          raw += printer58Service.cmds.BOLD_ON;
          raw += "=== NOTAS DE VENTA ===" + printer58Service.cmds.FEED_LINE;
          raw += printer58Service.cmds.BOLD_OFF;
          raw += printer58Service.cmds.ALIGN_LEFT;

          notasSales.forEach(sale => {
            const items = sale.productos || sale.items || [];
            const payMethod = (sale.paymentMethod || 'EFECTIVO').substring(0, 5);
            const cajero = (sale.cajeroNombre || sale.usuarioNombre || 'Edgar').substring(0, 6);
            const saleTot = sale.totals?.total || 0;
            totalNotas += saleTot;

            if (payMethod === 'EFECTI' || payMethod === 'EFECT') {
              totalEfectivo += saleTot;
            } else {
              totalTransf += saleTot;
            }

            items.forEach(item => {
              const qty = String(item.qty || item.cantidad || 1);
              const desc = printer58Service.normalizeText(item.name || item.nombre || 'Prenda').substring(0, 12).padEnd(12, ' ');
              const val = Number((item.qty || item.cantidad || 1) * (item.price || item.precio || 0));
              const valStr = "$" + val.toFixed(0);
              raw += `${qty} ${desc} ${valStr.padStart(4, ' ')} ${payMethod}/${cajero}` + printer58Service.cmds.FEED_LINE;
            });
          });
          raw += "--------------------------------" + printer58Service.cmds.FEED_LINE;
        }
        
        raw += printer58Service.cmds.ALIGN_RIGHT;
        raw += `Tot. Facturado: $${totalFacturas.toFixed(2)}` + printer58Service.cmds.FEED_LINE;
        raw += `Tot. Notas Venta: $${totalNotas.toFixed(2)}` + printer58Service.cmds.FEED_LINE;
        raw += "--------------------------------" + printer58Service.cmds.FEED_LINE;
        raw += `Efec: $${totalEfectivo.toFixed(2)}` + printer58Service.cmds.FEED_LINE;
        raw += `Transf: $${totalTransf.toFixed(2)}` + printer58Service.cmds.FEED_LINE;
        raw += printer58Service.cmds.BOLD_ON;
        raw += `GRAN TOTAL: $${(totalFacturas + totalNotas).toFixed(2)}` + printer58Service.cmds.FEED_LINE;
        raw += printer58Service.cmds.BOLD_OFF;
        raw += printer58Service.cmds.FEED_LINE + printer58Service.cmds.FEED_LINE + printer58Service.cmds.FEED_LINE;
        
        await printer58Service.connect();
        await printer58Service.sendBuffer(Buffer.from(raw, 'binary'));
        alert("✅ Reporte diario enviado a la CRM-03.");
      } catch (err) {
        alert("Error al imprimir en 58mm: " + err.message);
      }
    } else {
      // Impresión de sistema (HTML) de 80mm o 58mm
      const win = window.open('', '_blank');
      
      const facturasSales = salesToday.filter(s => !s.isNotaVenta && s.estadoSri !== 'NOTA_DE_VENTA' && s.status !== 'NOTA_DE_VENTA');
      const notasSales = salesToday.filter(s => s.isNotaVenta || s.estadoSri === 'NOTA_DE_VENTA' || s.status === 'NOTA_DE_VENTA');

      let totalFacturas = 0;
      let totalNotas = 0;
      let totalEfectivo = 0;
      let totalTransf = 0;

      let html = `
        <html>
        <head>
          <title>Reporte de Ventas Diarias</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; width: ${format === '58mm' ? '58mm' : '80mm'}; margin: 0 auto; padding: 10px; color: black; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed black; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { text-align: left; vertical-align: top; font-size: 11px; }
            .section-title { font-weight: bold; text-align: center; margin: 8px 0; border-top: 1px dashed black; border-bottom: 1px dashed black; padding: 2px 0; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="text-center">
            <h2 style="margin: 0;">GRAVITY DENIM</h2>
            <h3 style="margin: 4px 0 0 0; font-size: 13px;">REPORTE DE VENTAS DIARIAS</h3>
            <div>Fecha: ${now.toLocaleDateString('es-EC')}</div>
          </div>
          <div class="divider"></div>
      `;

      // Tabla Facturas
      if (facturasSales.length > 0) {
        html += `
          <div class="section-title">=== FACTURAS ===</div>
          <table>
            <thead>
              <tr style="border-bottom: 1px dashed black;">
                <th style="width: 10%;">CANT</th>
                <th style="width: 45%;">DETALLE</th>
                <th style="width: 15%; text-align: right;">VAL</th>
                <th style="width: 30%; text-align: right;">PAGO/CAJ</th>
              </tr>
            </thead>
            <tbody>
        `;

        facturasSales.forEach(sale => {
          const items = sale.productos || sale.items || [];
          const payMethod = sale.paymentMethod || 'EFECTIVO';
          const cajero = sale.cajeroNombre || sale.usuarioNombre || 'Edgar';
          const saleTot = sale.totals?.total || 0;
          
          totalFacturas += saleTot;
          if (payMethod === 'EFECTIVO') {
            totalEfectivo += saleTot;
          } else {
            totalTransf += saleTot;
          }

          items.forEach(item => {
            html += `
              <tr>
                <td>${item.qty || item.cantidad || 1}</td>
                <td>${item.name || item.nombre || 'Prenda'}</td>
                <td class="text-right">$${((item.qty || 1) * (item.price || 0)).toFixed(0)}</td>
                <td class="text-right">${payMethod.substring(0, 5)}/${cajero.substring(0, 6)}</td>
              </tr>
            `;
          });
        });

        html += `
            </tbody>
          </table>
        `;
      }

      // Tabla Notas de Venta
      if (notasSales.length > 0) {
        html += `
          <div class="section-title">=== NOTAS DE VENTA ===</div>
          <table>
            <thead>
              <tr style="border-bottom: 1px dashed black;">
                <th style="width: 10%;">CANT</th>
                <th style="width: 45%;">DETALLE</th>
                <th style="width: 15%; text-align: right;">VAL</th>
                <th style="width: 30%; text-align: right;">PAGO/CAJ</th>
              </tr>
            </thead>
            <tbody>
        `;

        notasSales.forEach(sale => {
          const items = sale.productos || sale.items || [];
          const payMethod = sale.paymentMethod || 'EFECTIVO';
          const cajero = sale.cajeroNombre || sale.usuarioNombre || 'Edgar';
          const saleTot = sale.totals?.total || 0;
          
          totalNotas += saleTot;
          if (payMethod === 'EFECTIVO') {
            totalEfectivo += saleTot;
          } else {
            totalTransf += saleTot;
          }

          items.forEach(item => {
            html += `
              <tr>
                <td>${item.qty || item.cantidad || 1}</td>
                <td>${item.name || item.nombre || 'Prenda'}</td>
                <td class="text-right">$${((item.qty || 1) * (item.price || 0)).toFixed(0)}</td>
                <td class="text-right">${payMethod.substring(0, 5)}/${cajero.substring(0, 6)}</td>
              </tr>
            `;
          });
        });

        html += `
            </tbody>
          </table>
        `;
      }

      html += `
          <div class="divider"></div>
          <div class="text-right" style="line-height: 1.6;">
            <div>Tot. Facturado: $${totalFacturas.toFixed(2)}</div>
            <div>Tot. Notas Venta: $${totalNotas.toFixed(2)}</div>
            <div class="divider"></div>
            <div>Efectivo: $${totalEfectivo.toFixed(2)}</div>
            <div>Transferencias: $${totalTransf.toFixed(2)}</div>
            <div class="bold" style="font-size: 13px; margin-top: 4px;">GRAN TOTAL: $${(totalFacturas + totalNotas).toFixed(2)}</div>
          </div>
        </body>
        </html>
      `;

      win.document.write(html);
      win.document.close();
    }
  };

  // Procesar datos para el mes actual y el día de hoy
  const { currentMonthTotal, currentMonthIVA, salesByIssuer, topProducts, todayTotal, todayEfectivo, todayTransferencia, monthEfectivo, monthTransferencia, todayTransferDetails, monthTransferDetails } = useMemo(() => {
    let currentMonthTotal = 0;
    let currentMonthIVA = 0;
    let todayTotal = 0;
    let todayEfectivo = 0;
    let todayTransferencia = 0;
    let monthEfectivo = 0;
    let monthTransferencia = 0;
    const todayTransferDetails = { 'Edgar': 0, 'Amparito': 0, 'Fabian': 0, 'Diana': 0, 'Otro': 0 };
    const monthTransferDetails = { 'Edgar': 0, 'Amparito': 0, 'Fabian': 0, 'Diana': 0, 'Otro': 0 };
    const issuerTotals = {};
    const productSales = {};

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentDate = now.getDate();

    sales.forEach(sale => {
      const saleDate = parseSaleDate(sale);
      if (!saleDate) return; // Saltar si no tiene ninguna fecha válida
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
      "Método de Pago",
      "A Quien (Transf)"
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
        finalRows.push(`"--- VENTAS DE: ${emisorNombre.toUpperCase()} ---",,,,,,,,,,,,,,,`);
        currentEmisor = emisorNombre;
      }

      const saleDate = parseSaleDate(sale);
      const fechaFormat = saleDate ? saleDate.toLocaleDateString('es-EC') : 'Sin fecha';
      
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
      const aQuien = sale.transferRecipient || '';

      // Envolver en comillas para evitar problemas con las comas en los textos
      finalRows.push([
        `"${fechaFormat}"`,
        `"${(sale.estadoSri || sale.status) === 'NOTA_DE_VENTA' ? 'Nota Venta' : 'Factura'}"`, 
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
        `"${metodoPago}"`,
        `"${aQuien}"`
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
      <style>{`
        .pos-table th, .pos-table td {
          padding: 14px 18px !important;
          text-align: left;
          vertical-align: middle;
          white-space: nowrap;
        }
      `}</style>
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2><Activity className="inline" style={{verticalAlign: 'bottom'}}/> Dashboard de Reportes</h2>
          <span style={{color: 'var(--text-muted)'}}>Inteligencia Multi-RUC y Rendimiento</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={handleImprimirReporteDelDia}
            className="btn-success" 
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={16} /> Imprimir Cierre del Día
          </button>
          <button 
            onClick={() => setActiveTab('sri')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'sri' ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Reportes SRI
          </button>
          <button 
            onClick={() => setActiveTab('cierre_hermano')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'cierre_hermano' ? '#f59e0b' : 'transparent', border: '1px solid #f59e0b', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Cierre por Hermano
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
          
          <div style={{ minWidth: '1500px' }}>
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
                  <th>PAGO / TRANSF</th>
                  <th>ESTADO</th>
                  <th>CLAVE ACCESO/AUTORIZACION</th>
                </tr>
              </thead>
              <tbody>
                {sales.filter(s => (s.estadoSri || s.status) !== 'NOTA_DE_VENTA').sort((a, b) => {
                  const dateA = parseSaleDate(a);
                  const dateB = parseSaleDate(b);
                  if (!dateA && !dateB) return 0;
                  if (!dateA) return 1;
                  if (!dateB) return -1;
                  return dateB - dateA;
                }).map((sale, idx) => {
                  const saleDate = parseSaleDate(sale);
                  if (!saleDate) return <tr key={idx}><td colSpan="15" style={{textAlign: 'center', color: 'var(--text-muted)'}}>Sin fecha</td></tr>;
                  const isAutorizado = (sale.estadoSri || sale.status) === 'AUTORIZADO';
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
                      <td className="text-right font-bold" style={{ color: 'var(--accent)' }}>{(sale.totals?.total || 0).toFixed(2)}</td>
                      <td>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>
                          {sale.paymentMethod || 'EFECTIVO'} {sale.transferRecipient ? `(${sale.transferRecipient})` : ''}
                        </span>
                      </td>
                      <td style={{ color: isAutorizado ? '#10b981' : 'var(--text-muted)', fontWeight: 'bold' }}>
                        {(sale.estadoSri || sale.status)}
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
          
          <div style={{ minWidth: '1300px' }}>
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
                  <th>PAGO / TRANSF</th>
                  <th>ESTADO</th>
                  <th>REFERENCIA INTERNA</th>
                </tr>
              </thead>
              <tbody>
                {sales.filter(s => (s.estadoSri || s.status) === 'NOTA_DE_VENTA').sort((a, b) => {
                  const dateA = parseSaleDate(a);
                  const dateB = parseSaleDate(b);
                  if (!dateA && !dateB) return 0;
                  if (!dateA) return 1;
                  if (!dateB) return -1;
                  return dateB - dateA;
                }).map((sale, idx) => {
                  const saleDate = parseSaleDate(sale);
                  if (!saleDate) return <tr key={idx}><td colSpan="15" style={{textAlign: 'center', color: 'var(--text-muted)'}}>Sin fecha</td></tr>;
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
                      <td>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>
                          {sale.paymentMethod || 'EFECTIVO'} {sale.transferRecipient ? `(${sale.transferRecipient})` : ''}
                        </span>
                      </td>
                      <td style={{ color: 'var(--warning)', fontWeight: 'bold' }}>
                        {(sale.estadoSri || sale.status)}
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
            <button 
              onClick={handleImprimirReporteDelDia}
              className="btn-primary" 
              style={{ marginTop: '1rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '6px' }}
            >
              <Printer size={16} /> Imprimir Cierre del Día
            </button>
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
            {['Edgar', 'Amparito', 'Fabian', 'Diana', 'Otro'].map(name => todayTransferDetails[name] > 0 && (
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
            {['Edgar', 'Amparito', 'Fabian', 'Diana', 'Otro'].map(name => monthTransferDetails[name] > 0 && (
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

          {/* Filtros de Reportes */}
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fecha:</label>
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
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
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Estado SRI:</label>
              <select value={filterSriState} onChange={(e) => setFilterSriState(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }}>
                <option value="">Todos</option>
                <option value="AUTORIZADO">Autorizada</option>
                <option value="PENDIENTE_ENVIO">Pendiente Envío</option>
                <option value="RECHAZADA">Rechazada</option>
                <option value="DEVUELTA">Devuelta</option>
                <option value="NOTA_DE_VENTA">Nota de Venta</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={() => { setFilterDate(''); setFilterClient(''); setFilterInvoice(''); setFilterSriState(''); }} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Limpiar Filtros</button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="pos-table" style={{ minWidth: '950px' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo Doc.</th>
                  <th>Emisor</th>
                  <th>Cliente</th>
                  <th>ID/Ref</th>
                  <th>Productos Vendidos</th>
                  <th>Método/Quién Cobró</th>
                  <th>Subtotal</th>
                  <th>Total</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.sort((a, b) => {
                  const dateA = parseSaleDate(a);
                  const dateB = parseSaleDate(b);
                  if (!dateA && !dateB) return 0;
                  if (!dateA) return 1;
                  if (!dateB) return -1;
                  return dateB - dateA;
                }).map((sale, idx) => {
                  const saleDate = parseSaleDate(sale);
                  if (!saleDate) return <tr key={idx}><td colSpan="15" style={{textAlign: 'center', color: 'var(--text-muted)'}}>Sin fecha</td></tr>;
                  const itemsQty = (sale.productos || sale.items || []) ? (sale.productos || sale.items || []).reduce((acc, item) => acc + item.qty, 0) : 0;
                  const isNota = (sale.estadoSri === 'NOTA_DE_VENTA' || sale.status === 'NOTA_DE_VENTA');
                  const isAutorizada = (sale.estadoSri === 'AUTORIZADO' || sale.estadoSri === 'AUTORIZADA' || sale.status === 'AUTORIZADO' || sale.status === 'AUTORIZADA');
                  
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' }}>
                      <td style={{ whiteSpace: 'nowrap' }}>{saleDate.toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>
                        <span style={{ 
                          background: isNota ? 'var(--warning)' : '#3b82f6', 
                          color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 'bold' 
                        }}>
                          {isNota ? 'NOTA VENTA' : 'FACTURA SRI'}
                        </span>
                      </td>
                      <td>{sale.issuerName || sale.issuerId}</td>
                      <td>{(sale.cliente || sale.customer)?.nombre || 'Consumidor Final'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sale.id.substring(0, 8)}...</td>
                      <td style={{ minWidth: '220px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {(sale.productos || sale.items || []).map((p, i) => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <span style={{ color: 'var(--text-main)' }}><b>{p.qty}x</b> {p.name}</span>
                              <span style={{ color: 'var(--text-muted)' }}>${(p.price*p.qty).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span style={{ 
                          display: 'inline-block',
                          background: sale.paymentMethod === 'TRANSFERENCIA' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: sale.paymentMethod === 'TRANSFERENCIA' ? '#3b82f6' : '#10b981',
                          padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold'
                        }}>
                          {sale.paymentMethod || 'EFECTIVO'} {sale.transferRecipient ? `(${sale.transferRecipient})` : ''}
                        </span>
                      </td>
                      <td>${(sale.totals?.subtotal || 0).toFixed(2)}</td>
                      <td style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1.1rem' }}>${(sale.totals?.total || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => setSelectedVenta(sale)}
                            style={{ padding: '6px 10px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            Ver
                          </button>
                          {(isAutorizada || isNota) ? (
                            <>
                              <button 
                                onClick={() => handleReimprimirClick(sale)}
                                style={{ padding: '6px 10px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                              >
                                Reimprimir
                              </button>
                              {!isNota && (
                                <button 
                                  onClick={() => window.open(`/api/sri/pdf?claveAcceso=${sale.claveAcceso || sale.id}`, '_blank')}
                                  style={{ padding: '6px 10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                  PDF
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic', padding: '4px 8px' }}>
                              {sale.estadoSri || sale.status || 'PENDIENTE'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No hay transacciones registradas que coincidan con los filtros</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}



      {/* Detalle Modal */}
      {selectedVenta && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
           <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'white' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
               <h3 style={{ margin: 0 }}>Detalle de Factura</h3>
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
                 <div><b>Estado SRI:</b> <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{selectedVenta.estadoSri || selectedVenta.status || 'NOTA_DE_VENTA'}</span></div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div>Subtotal: ${(selectedVenta.totals?.subtotal || selectedVenta.subtotal || 0).toFixed(2)}</div>
                 <div>IVA (15%): ${(selectedVenta.totals?.ivaAmount || selectedVenta.ivaAmount || 0).toFixed(2)}</div>
                 <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--success)', marginTop: '4px' }}>Total: ${(selectedVenta.totals?.total || selectedVenta.total || 0).toFixed(2)}</div>
               </div>
             </div>

             <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', fontSize: '0.8rem' }}>
               <div><b>Clave Acceso:</b> {selectedVenta.claveAcceso || selectedVenta.id}</div>
               <div><b>Número Autorización:</b> {selectedVenta.numeroAutorizacion || 'N/A'}</div>
               <div><b>Fecha Autorización:</b> {selectedVenta.fechaAutorizacion || 'N/A'}</div>
             </div>

             <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
               <button onClick={() => handleReimprimirClick(selectedVenta)} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                 <Printer size={16} /> Reimprimir
               </button>
               <button onClick={() => setSelectedVenta(null)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer' }}>
                 Cerrar
               </button>
             </div>
           </div>
         </div>
      )}

      {activeTab === 'cierre_hermano' && (
        <CierreHermanoView sales={sales} />
      )}

    </div>
  );
}

function CierreHermanoView({ sales }) {
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

  // Filtrar ventas por fecha
  const salesInDateRange = useMemo(() => {
    return sales.filter(sale => {
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


