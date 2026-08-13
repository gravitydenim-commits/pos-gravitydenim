import React, { useMemo, useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Percent, Package, Users, Activity, FileText, Download, FileType2, FileCode2, Printer, Calendar, ChevronLeft, ChevronRight, FileSpreadsheet, Building2, Filter, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { generarFacturaA4 } from '../../utils/generadorA4';
import CierreHermanoView from './CierreHermanoView';

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

// Obtiene la fecha fiscal del comprobante dando máxima prioridad a fechaEmision/fecha
const getSaleFiscalDate = (sale) => {
  if (!sale) return null;

  // 1. Campo Principal: Fecha de emisión fiscal (fechaEmision / fecha)
  const rawFiscalDate = sale.fechaEmision || sale.fecha;
  if (rawFiscalDate) {
    if (typeof rawFiscalDate?.toDate === 'function') {
      return rawFiscalDate.toDate();
    }
    if (rawFiscalDate?.seconds) {
      return new Date(rawFiscalDate.seconds * 1000);
    }
    if (typeof rawFiscalDate === 'string' && rawFiscalDate.trim() !== '') {
      if (rawFiscalDate.includes('/')) {
        const parts = rawFiscalDate.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const parsed = new Date(year, month, day);
          if (!isNaN(parsed.getTime())) return parsed;
        }
      }
      const parsed = new Date(rawFiscalDate);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (rawFiscalDate instanceof Date && !isNaN(rawFiscalDate.getTime())) {
      return rawFiscalDate;
    }
  }

  // 2. Respaldo para registros antiguos sin fechaEmision: createdAt / fechaTransaccion / date
  const rawFallback = sale.createdAt || sale.fechaTransaccion || sale.date;
  if (rawFallback) {
    if (typeof rawFallback?.toDate === 'function') {
      return rawFallback.toDate();
    }
    if (rawFallback?.seconds) {
      return new Date(rawFallback.seconds * 1000);
    }
    if (typeof rawFallback === 'string' && rawFallback.trim() !== '') {
      const parsed = new Date(rawFallback);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (rawFallback instanceof Date && !isNaN(rawFallback.getTime())) {
      return rawFallback;
    }
  }

  return null;
};

export default function ReportesDashboard({ sales, issuers }) {
  const [filterDate, setFilterDate] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterSriState, setFilterSriState] = useState('');
  const [selectedVenta, setSelectedVenta] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);

  // --- VARIABLES DE ESTADO PARA NAVEGACIÓN Y REPORTES ---
  const [mainTab, setMainTab] = useState('contadora'); // 'contadora' | 'general'
  const [cierreDate, setCierreDate] = useState(() => {
    const d = new Date();
    // Timezone safe Ecuador (UTC-5)
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ecDate = new Date(utc + (3600000 * -5));
    return ecDate.toISOString().slice(0, 10);
  });
  
  const [cierreFilterDocType, setCierreFilterDocType] = useState('Todos'); // 'Todos' | 'Facturas' | 'Notas de venta'
  const [cierreFilterPayment, setCierreFilterPayment] = useState('Todas'); // 'Todas' | 'Efectivo' | 'Transferencia' | 'Pago mixto'
  const [cierreFilterEmitter, setCierreFilterEmitter] = useState('Todos'); // 'Todos' | 'Edgar' | 'Fabián' | 'Amparito'
  const [cierreFilterOwner, setCierreFilterOwner] = useState('Todos'); // 'Todos' | 'Edgar' | 'Fabián' | 'Amparito'
  const [cierreFilterClientText, setCierreFilterClientText] = useState('');
  const [cierreFilterProductText, setCierreFilterProductText] = useState('');
  const [cierreGrouping, setCierreGrouping] = useState('Sin agrupar');
  const [printOption, setPrintOption] = useState('detalle'); // 'detalle' | 'resumen'
  const [cierrePaperFormat, setCierrePaperFormat] = useState('80mm'); // '80mm' | 'normal'

  const [productsList, setProductsList] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { getDocs, collection } = await import('firebase/firestore');
        const { db } = await import('../../firebase/config');
        const snap = await getDocs(collection(db, 'productos'));
        setProductsList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error loading products in ReportesDashboard:", err);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { getDocs, collection } = await import('firebase/firestore');
        const { db } = await import('../../firebase/config');
        const snap = await getDocs(collection(db, 'users'));
        setUsersList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error loading users in ReportesDashboard:", err);
      }
    };
    fetchUsers();
  }, []);

  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      if ((sale.status || sale.estado || '').toUpperCase() === 'ERROR_DUPLICADO') return false;
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

      const isNota = venta.isNotaVenta || (venta.estadoSri === 'NOTA_DE_VENTA' || venta.status === 'NOTA_DE_VENTA');
      const isIminMode = typeof window !== 'undefined' && (
        localStorage.getItem('iminSwanEnabled') === 'true' || 
        /imin|iMin|I20D01|D4-504|I24D03|DS2-25/i.test(navigator.userAgent) ||
        Boolean(window.AndroidBridge)
      );

      if (isIminMode) {
        try {
          const iminMod = await import('../../utils/iminPrinter');
          await iminMod.printTicketImin(
            emisorData,
            venta.productos || venta.items || [],
            venta.totals || { subtotal: venta.subtotal || 0, ivaAmount: venta.ivaAmount || 0, total: venta.total || 0 },
            venta.cliente || venta.customer || { nombre: 'CONSUMIDOR FINAL', numeroIdentificacion: '9999999999999' },
            venta.numeroComprobante || venta.claveAcceso || venta.id,
            venta.paymentMethod || 'EFECTIVO',
            isNota,
            venta.paymentDetails
          );
          return;
        } catch (iminErr) {
          console.warn("⚠️ No se pudo reimprimir vía iMin, recurriendo al sistema gráfico:", iminErr);
        }
      }

      const { imprimirTicket } = await import('../../utils/printTicket');
      imprimirTicket(
        emisorData,
        venta.productos || venta.items || [],
        venta.totals || { subtotal: venta.subtotal || 0, ivaAmount: venta.ivaAmount || 0, total: venta.total || 0 },
        venta.cliente || venta.customer || { nombre: 'CONSUMIDOR FINAL', numeroIdentificacion: '9999999999999' },
        venta.claveAcceso || venta.id,
        venta.paymentMethod || 'EFECTIVO',
        venta.transferRecipient,
        isNota,
        format,
        true // isReprint = true
      );
    } catch (err) {
      alert("Error al reimprimir: " + err.message);
    }
  };

  const handleReimprimirClick = (venta) => {
    const estado = venta.estadoSri || venta.status;
    const isNota = venta.isNotaVenta || (estado === 'NOTA_DE_VENTA');
    if (!isNota && estado !== 'AUTORIZADO' && estado !== 'AUTORIZADA') {
      alert(`⚠️ NO SE PUEDE REIMPRIMIR:\nEl comprobante no está autorizado por el SRI. Estado actual: ${estado || 'PENDIENTE'}`);
      return;
    }

    // Auto-detectar formato configurado en localStorage
    const printerFormat = localStorage.getItem('printerFormat') || '80mm';
    handleReimprimir(venta, printerFormat);
  };

  const handleAnularVenta = async (sale) => {
    const isNota = sale.isNotaVenta || sale.estadoSri === 'NOTA_DE_VENTA' || sale.status === 'NOTA_DE_VENTA';
    const docTypeStr = isNota ? 'NOTA DE VENTA' : 'FACTURA';

    const proceed = window.confirm(
      `⚠️ ANULACIÓN DE COMPROBANTE\n\n` +
      `¿Seguro que deseas anular esta ${docTypeStr} (ID: ${sale.id})?\n` +
      `Esta acción no modificará el inventario pero cambiará su estado a ANULADA.`
    );
    if (!proceed) return;

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../../firebase/config');
      await updateDoc(doc(db, 'ventas', sale.id), {
        estadoVenta: 'ANULADA',
        estadoSri: 'ANULADA',
        status: 'ANULADA'
      });
      alert(`${docTypeStr} marcada como ANULADA con éxito.`);
      window.location.reload();
    } catch (err) {
      alert('Error al anular: ' + err.message);
    }
  };

  const handleImprimirReporteDelDia = async () => {
    const getCajeroName = (sale) => {
      const emisorId = sale.emisorId || sale.issuerId;
      if (emisorId && issuers) {
        const found = issuers.find(i => i.id === emisorId);
        if (found) {
          const name = found.name || found.razonSocial || '';
          if (name.toLowerCase().includes('ampar')) return 'Amparito';
          if (name.toLowerCase().includes('geovanny') || name.toLowerCase().includes('edgar')) return 'Edgar';
          return name;
        }
      }
      const uid = sale.cajeroUid || sale.usuarioUid;
      if (uid) {
        const found = usersList.find(u => u.id === uid);
        if (found && found.name && !found.name.toLowerCase().includes('caja')) {
          return found.name;
        }
      }
      return 'Edgar';
    };

    const getAbreviaturaMetodo = (method) => {
      const m = (method || '').toUpperCase();
      if (m.includes('TRANSFERENCIA') || m.includes('TRANS')) return 'TR';
      return 'EF';
    };

    const getAbreviaturaNombre = (name) => {
      const n = (name || '').toLowerCase();
      if (n.includes('ampar')) return 'AMP';
      if (n.includes('fabian') || n.includes('junior') || n.includes('jr')) return 'JR';
      if (n.includes('edgar') || n.includes('geovanny') || n.includes('toli')) return 'TOLI';
      if (n.includes('diana') || n.includes('dia')) return 'DIA';
      return name.substring(0, 4).toUpperCase();
    };

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

    const facturasSales = salesToday.filter(s => !s.isNotaVenta && s.estadoSri !== 'NOTA_DE_VENTA' && s.status !== 'NOTA_DE_VENTA');
    const notasSales = salesToday.filter(s => s.isNotaVenta || s.estadoSri === 'NOTA_DE_VENTA' || s.status === 'NOTA_DE_VENTA');

    if (typeof window !== 'undefined' && window.AndroidBridge) {
      const lines = [
        { text: "GRAVITY DENIM", size: 26, align: 1, bold: true },
        { text: "REPORTE DE VENTAS DIARIAS", size: 18, align: 1, bold: true },
        { text: `Fecha: ${now.toLocaleDateString('es-EC')} ${now.toLocaleTimeString('es-EC')}`, size: 16, align: 1 },
        { text: "================================================", size: 16, align: 1 }
      ];

      let totalFacturas = 0;
      let totalNotas = 0;
      let totalEfectivo = 0;
      let totalTransf = 0;

      const padText = (left, right, width = 48) => {
        const space = width - left.length - right.length;
        return left + " ".repeat(Math.max(1, space)) + right;
      };

      // Facturas
      if (facturasSales.length > 0) {
        lines.push({ text: "=== FACTURAS ===", size: 18, align: 1, bold: true });
        lines.push({ text: padText("CANT DETALLE", "VAL  PAGO/CAJ", 48), size: 16, align: 0, bold: true });
        lines.push({ text: "------------------------------------------------", size: 16, align: 1 });

        facturasSales.forEach(sale => {
          const items = sale.productos || sale.items || [];
          const payMethod = sale.paymentMethod || 'EFECTIVO';
          const saleTot = sale.totals?.total || 0;
          totalFacturas += saleTot;

          const isEfectivo = payMethod === 'EFECTIVO';
          if (isEfectivo) {
            totalEfectivo += saleTot;
          } else {
            totalTransf += saleTot;
          }

          const payAbbr = getAbreviaturaMetodo(payMethod);
          const nameAbbr = getAbreviaturaNombre(isEfectivo ? getCajeroName(sale) : (sale.transferRecipient || 'Otro'));
          const infoCobro = `${payAbbr}/${nameAbbr}`;

          items.forEach(item => {
            const qty = String(item.qty || item.cantidad || 1);
            const name = (item.name || item.nombre || 'Prenda').substring(0, 18);
            const val = Number((item.qty || item.cantidad || 1) * (item.price || item.precio || 0));
            const valStr = `$${val.toFixed(2)}`;

            const leftSide = `${qty} ${name.padEnd(18, ' ')}`;
            const rightSide = `${valStr.padStart(7, ' ')}  ${infoCobro}`;
            lines.push({ text: padText(leftSide, rightSide, 48), size: 16, align: 0 });
          });
        });
        lines.push({ text: "------------------------------------------------", size: 16, align: 1 });
      }

      // Notas de Venta
      if (notasSales.length > 0) {
        lines.push({ text: "=== NOTAS DE VENTA ===", size: 18, align: 1, bold: true });
        lines.push({ text: padText("CANT DETALLE", "VAL  PAGO/CAJ", 48), size: 16, align: 0, bold: true });
        lines.push({ text: "------------------------------------------------", size: 16, align: 1 });

        notasSales.forEach(sale => {
          const items = sale.productos || sale.items || [];
          const payMethod = sale.paymentMethod || 'EFECTIVO';
          const saleTot = sale.totals?.total || 0;
          totalNotas += saleTot;

          const isEfectivo = payMethod === 'EFECTIVO';
          if (isEfectivo) {
            totalEfectivo += saleTot;
          } else {
            totalTransf += saleTot;
          }

          const payAbbr = getAbreviaturaMetodo(payMethod);
          const nameAbbr = getAbreviaturaNombre(isEfectivo ? getCajeroName(sale) : (sale.transferRecipient || 'Otro'));
          const infoCobro = `${payAbbr}/${nameAbbr}`;

          items.forEach(item => {
            const qty = String(item.qty || item.cantidad || 1);
            const name = (item.name || item.nombre || 'Prenda').substring(0, 18);
            const val = Number((item.qty || item.cantidad || 1) * (item.price || item.precio || 0));
            const valStr = `$${val.toFixed(2)}`;

            const leftSide = `${qty} ${name.padEnd(18, ' ')}`;
            const rightSide = `${valStr.padStart(7, ' ')}  ${infoCobro}`;
            lines.push({ text: padText(leftSide, rightSide, 48), size: 16, align: 0 });
          });
        });
        lines.push({ text: "------------------------------------------------", size: 16, align: 1 });
      }

      // Totales finales
      lines.push({ text: padText("Tot. Facturado:", `$${totalFacturas.toFixed(2)}`, 48), size: 16, align: 0 });
      lines.push({ text: padText("Tot. Notas Venta:", `$${totalNotas.toFixed(2)}`, 48), size: 16, align: 0 });
      lines.push({ text: "------------------------------------------------", size: 16, align: 1 });
      lines.push({ text: padText("Efectivo:", `$${totalEfectivo.toFixed(2)}`, 48), size: 16, align: 0 });
      lines.push({ text: padText("Transferencias:", `$${totalTransf.toFixed(2)}`, 48), size: 16, align: 0 });
      lines.push({ text: padText("GRAN TOTAL:", `$${(totalFacturas + totalNotas).toFixed(2)}`, 48), size: 18, align: 0, bold: true });

      try {
        window.AndroidBridge.printTicket(JSON.stringify({ lines }));
      } catch (e) {
        alert("Error al enviar reporte al puente USB: " + e.message);
      }
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
            const payMethod = sale.paymentMethod || 'EFECTIVO';
            const saleTot = sale.totals?.total || 0;
            totalFacturas += saleTot;

            const isEfectivo = payMethod === 'EFECTIVO';
            if (isEfectivo) {
              totalEfectivo += saleTot;
            } else {
              totalTransf += saleTot;
            }

            const payAbbr = getAbreviaturaMetodo(payMethod);
            const nameAbbr = getAbreviaturaNombre(isEfectivo ? getCajeroName(sale) : (sale.transferRecipient || 'Otro'));
            const infoCobro = `${payAbbr}/${nameAbbr}`;

            items.forEach(item => {
              const qty = String(item.qty || item.cantidad || 1);
              const desc = printer58Service.normalizeText(item.name || item.nombre || 'Prenda').substring(0, 12).padEnd(12, ' ');
              const val = Number((item.qty || item.cantidad || 1) * (item.price || item.precio || 0));
              const valStr = "$" + val.toFixed(0);
              raw += `${qty} ${desc} ${valStr.padStart(4, ' ')} ${infoCobro}` + printer58Service.cmds.FEED_LINE;
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
            const payMethod = sale.paymentMethod || 'EFECTIVO';
            const saleTot = sale.totals?.total || 0;
            totalNotas += saleTot;

            const isEfectivo = payMethod === 'EFECTIVO';
            if (isEfectivo) {
              totalEfectivo += saleTot;
            } else {
              totalTransf += saleTot;
            }

            const payAbbr = getAbreviaturaMetodo(payMethod);
            const nameAbbr = getAbreviaturaNombre(isEfectivo ? getCajeroName(sale) : (sale.transferRecipient || 'Otro'));
            const infoCobro = `${payAbbr}/${nameAbbr}`;

            items.forEach(item => {
              const qty = String(item.qty || item.cantidad || 1);
              const desc = printer58Service.normalizeText(item.name || item.nombre || 'Prenda').substring(0, 12).padEnd(12, ' ');
              const val = Number((item.qty || item.cantidad || 1) * (item.price || item.precio || 0));
              const valStr = "$" + val.toFixed(0);
              raw += `${qty} ${desc} ${valStr.padStart(4, ' ')} ${infoCobro}` + printer58Service.cmds.FEED_LINE;
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
          const saleTot = sale.totals?.total || 0;
          
          totalFacturas += saleTot;
          const isEfectivo = payMethod === 'EFECTIVO';
          if (isEfectivo) {
            totalEfectivo += saleTot;
          } else {
            totalTransf += saleTot;
          }

          const payAbbr = getAbreviaturaMetodo(payMethod);
          const nameAbbr = getAbreviaturaNombre(isEfectivo ? getCajeroName(sale) : (sale.transferRecipient || 'Otro'));
          const infoCobro = `${payAbbr} / ${nameAbbr}`;

          items.forEach(item => {
            html += `
              <tr>
                <td>${item.qty || item.cantidad || 1}</td>
                <td>${item.name || item.nombre || 'Prenda'}</td>
                <td class="text-right">$${((item.qty || 1) * (item.price || 0)).toFixed(0)}</td>
                <td class="text-right">${infoCobro}</td>
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
          const saleTot = sale.totals?.total || 0;
          
          totalNotas += saleTot;
          const isEfectivo = payMethod === 'EFECTIVO';
          if (isEfectivo) {
            totalEfectivo += saleTot;
          } else {
            totalTransf += saleTot;
          }

          const payAbbr = getAbreviaturaMetodo(payMethod);
          const nameAbbr = getAbreviaturaNombre(isEfectivo ? getCajeroName(sale) : (sale.transferRecipient || 'Otro'));
          const infoCobro = `${payAbbr} / ${nameAbbr}`;

          items.forEach(item => {
            html += `
              <tr>
                <td>${item.qty || item.cantidad || 1}</td>
                <td>${item.name || item.nombre || 'Prenda'}</td>
                <td class="text-right">$${((item.qty || 1) * (item.price || 0)).toFixed(0)}</td>
                <td class="text-right">${infoCobro}</td>
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
  const { 
    currentMonthTotal, 
    currentMonthIVA, 
    numFacturasMes,
    numNotasMes,
    promedioVentaMes,
    salesByIssuer, 
    topProducts, 
    todayTotal, 
    todayEfectivo, 
    todayTransferencia, 
    monthEfectivo, 
    monthTransferencia, 
    todayTransferDetails, 
    monthTransferDetails 
  } = useMemo(() => {
    let currentMonthTotal = 0;
    let currentMonthIVA = 0;
    let numFacturasMes = 0;
    let numNotasMes = 0;
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
      if (!saleDate) return; 
      const isCurrentMonth = saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
      const isToday = isCurrentMonth && saleDate.getDate() === currentDate;

      const total = sale.totals?.total || 0;
      const method = sale.paymentMethod || 'EFECTIVO';
      const isNota = sale.isNotaVenta || sale.estadoSri === 'NOTA_DE_VENTA' || sale.status === 'NOTA_DE_VENTA';

      // Usar estrictamente el valor de IVA guardado
      const iva = isNota ? 0 : (sale.totals?.ivaAmount || 0);

      if (isCurrentMonth) {
        currentMonthTotal += total;
        currentMonthIVA += iva;
        if (isNota) {
          numNotasMes += 1;
        } else {
          numFacturasMes += 1;
        }

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

    const totalTransaccionesMes = numFacturasMes + numNotasMes;
    const promedioVentaMes = totalTransaccionesMes > 0 ? (currentMonthTotal / totalTransaccionesMes) : 0;

    return { 
      currentMonthTotal, 
      currentMonthIVA, 
      numFacturasMes,
      numNotasMes,
      promedioVentaMes,
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

  // =========================================================================
  // --- INICIO DE LÓGICA DE CIERRE DIARIO ---
  // =========================================================================

  const getShortName = (name) => {
    if (!name) return 'Desconocido';
    const n = name.toLowerCase();
    if (n.includes('fabian') || n.includes('fabián')) return 'Fabián';
    if (n.includes('edgar') || n.includes('geovanny')) return 'Edgar';
    if (n.includes('ampar') || n.includes('deysi')) return 'Amparito';
    return name.split(' ')[0];
  };

  const resolveEmitterShortName = (sale) => {
    if (sale.emitterShortName) return sale.emitterShortName;
    const emisorId = sale.emisorId || sale.issuerId;
    if (emisorId && issuers) {
      const found = issuers.find(i => i.id === emisorId);
      if (found) {
        return getShortName(found.name || found.razonSocial);
      }
    }
    return getShortName(sale.issuerName);
  };

  const getSalePaymentBreakdown = (sale) => {
    const details = sale.paymentDetails || {};
    let cash = 0;
    let transfer = 0;

    if (details.isMixed) {
      const payments = details.payments || [];
      payments.forEach(p => {
        const method = (p.method || '').toUpperCase();
        const amount = Number(p.amount) || 0;
        if (method === 'EFECTIVO') {
          cash += amount;
        } else if (method === 'TRANSFERENCIA') {
          transfer += amount;
        }
      });
    } else {
      const method = (sale.paymentMethod || '').toUpperCase();
      const totalAmount = sale.totals?.total || sale.total || 0;
      if (method === 'EFECTIVO') {
        cash = totalAmount;
      } else if (method === 'TRANSFERENCIA') {
        transfer = totalAmount;
      }
    }
    return { cash, transfer };
  };

  const calculateItemTotals = (item, isNotaVenta, vatIncluded = true) => {
    const qty = Number(item.qty || item.cantidad || 1);
    const rawPrice = Number(item.price !== undefined ? item.price : (item.precio || 0));
    const descuento = Number(item.descuento || 0);

    let precioTotalSinImpuesto = 0;
    let itemIva = 0;
    let itemTotal = 0;

    if (isNotaVenta) {
      itemTotal = Number(((rawPrice * qty) - descuento).toFixed(2));
      precioTotalSinImpuesto = itemTotal;
      itemIva = 0;
    } else if (vatIncluded) {
      itemTotal = Number(((rawPrice * qty) - descuento).toFixed(2));
      precioTotalSinImpuesto = Number((itemTotal / 1.15).toFixed(2));
      itemIva = Number((itemTotal - precioTotalSinImpuesto).toFixed(2));
    } else {
      precioTotalSinImpuesto = Number(((rawPrice * qty) - descuento).toFixed(2));
      itemIva = Number((precioTotalSinImpuesto * 0.15).toFixed(2));
      itemTotal = Number((precioTotalSinImpuesto + itemIva).toFixed(2));
    }

    return {
      subtotal: precioTotalSinImpuesto,
      iva: itemIva,
      total: itemTotal
    };
  };

  const resolveProductOwner = (item) => {
    const itemOwner = item.ownerShortName || item.ownerName || item.ownerId || item.propietario || item.owner;
    if (itemOwner && typeof itemOwner === 'string' && itemOwner.trim() !== '') {
      return getShortName(itemOwner.trim());
    }
    return 'Pendiente';
  };

  const allocatePaymentToItem = (itemPriceTotal, saleTotal, cashPaid, transferPaid) => {
    if (saleTotal <= 0) return { cash: 0, transfer: 0 };
    const ratio = itemPriceTotal / saleTotal;
    return {
      cash: Number((cashPaid * ratio).toFixed(2)),
      transfer: Number((transferPaid * ratio).toFixed(2))
    };
  };

  const salesForCierre = useMemo(() => {
    return sales.filter(sale => {
      const saleDate = parseSaleDate(sale);
      if (!saleDate) return false;
      const saleDateStr = saleDate.toISOString().slice(0, 10);
      return saleDateStr === cierreDate;
    });
  }, [sales, cierreDate]);

  const flatItemRows = useMemo(() => {
    const rows = [];
    salesForCierre.forEach(sale => {
      const saleDate = parseSaleDate(sale);
      const timeStr = saleDate ? saleDate.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A';
      
      const isNota = sale.isNotaVenta || (sale.estadoSri === 'NOTA_DE_VENTA') || (sale.status === 'NOTA_DE_VENTA');
      const docType = isNota ? 'Nota de venta' : 'Factura';
      const docNo = sale.numeroComprobante || sale.secuencial || 'S/N';
      
      const clientName = (sale.cliente || sale.customer)?.nombre || 'CONSUMIDOR FINAL';
      const clientId = (sale.cliente || sale.customer)?.numeroIdentificacion || '9999999999999';
      
      const emitterShort = resolveEmitterShortName(sale);
      const { cash: saleCash, transfer: saleTransfer } = getSalePaymentBreakdown(sale);
      const saleTotal = sale.totals?.total || sale.total || 0;
      
      const items = sale.productos || sale.items || [];
      
      items.forEach((item, idx) => {
        const { subtotal: itemSubtotal, iva: itemIva, total: itemTotal } = calculateItemTotals(item, isNota, sale.vatIncluded !== false);
        const owner = resolveProductOwner(item);
        const { cash: itemAllocatedCash, transfer: itemAllocatedTransfer } = allocatePaymentToItem(itemTotal, saleTotal, saleCash, saleTransfer);
        
        rows.push({
          id: `${sale.id}-${idx}`,
          saleId: sale.id,
          time: timeStr,
          docType,
          docNo,
          clientName,
          clientId,
          productName: item.name || item.nombre || 'Prenda',
          productCode: item.codigo || item.codigoBarras || item.id || '',
          productCategory: item.categoria || 'General',
          qty: Number(item.qty || item.cantidad || 1),
          unitPrice: Number(item.price !== undefined ? item.price : (item.precio || 0)),
          subtotal: itemSubtotal,
          iva: itemIva,
          total: itemTotal,
          allocatedCash: itemAllocatedCash,
          allocatedTransfer: itemAllocatedTransfer,
          paymentMethod: sale.paymentMethod || 'EFECTIVO',
          isMixed: sale.paymentDetails?.isMixed || false,
          emitterShort,
          owner,
          estado: sale.estadoVenta || sale.status || 'COMPLETADA'
        });
      });
    });
    return rows;
  }, [salesForCierre, productsList, issuers]);

  const filteredItemRows = useMemo(() => {
    return flatItemRows.filter(row => {
      // 1. Tipo de documento
      if (cierreFilterDocType === 'Facturas' && row.docType !== 'Factura') return false;
      if (cierreFilterDocType === 'Notas de venta' && row.docType !== 'Nota de venta') return false;

      // 2. Forma de pago
      if (cierreFilterPayment === 'Efectivo' && row.allocatedCash <= 0) return false;
      if (cierreFilterPayment === 'Transferencia' && row.allocatedTransfer <= 0) return false;
      if (cierreFilterPayment === 'Pago mixto' && !row.isMixed) return false;

      // 3. Emisor o hermano
      if (cierreFilterEmitter !== 'Todos' && row.emitterShort !== cierreFilterEmitter) return false;

      // 4. Propietario del producto
      if (cierreFilterOwner !== 'Todos' && row.owner !== cierreFilterOwner) return false;

      // 5. Cliente search
      if (cierreFilterClientText.trim() !== '') {
        const text = cierreFilterClientText.toLowerCase().trim();
        const matchesClient = row.clientName.toLowerCase().includes(text) || row.clientId.toLowerCase().includes(text);
        if (!matchesClient) return false;
      }

      // 6. Producto search
      if (cierreFilterProductText.trim() !== '') {
        const text = cierreFilterProductText.toLowerCase().trim();
        const matchesProduct = row.productName.toLowerCase().includes(text) || row.productCode.toLowerCase().includes(text) || row.productCategory.toLowerCase().includes(text);
        if (!matchesProduct) return false;
      }

      return true;
    });
  }, [flatItemRows, cierreFilterDocType, cierreFilterPayment, cierreFilterEmitter, cierreFilterOwner, cierreFilterClientText, cierreFilterProductText]);

  const closureTotals = useMemo(() => {
    let totalVendido = 0;
    let totalEfectivo = 0;
    let totalTransferencia = 0;
    let totalPagosMixtos = 0;
    let totalFacturas = 0;
    let totalNotasVenta = 0;
    let totalIva = 0;
    let totalPrendas = 0;
    
    filteredItemRows.forEach(row => {
      totalVendido += row.total;
      totalEfectivo += row.allocatedCash;
      totalTransferencia += row.allocatedTransfer;
      if (row.isMixed) totalPagosMixtos += row.total;
      if (row.docType === 'Factura') {
        totalFacturas += row.total;
      } else {
        totalNotasVenta += row.total;
      }
      totalIva += row.iva;
      totalPrendas += row.qty;
    });

    const uniqueSalesCount = new Set(filteredItemRows.map(row => row.saleId)).size;

    return {
      totalVendido,
      totalEfectivo,
      totalTransferencia,
      totalPagosMixtos,
      totalFacturas,
      totalNotasVenta,
      totalIva,
      totalPrendas,
      numVentas: uniqueSalesCount
    };
  }, [filteredItemRows]);

  const groupedSections = useMemo(() => {
    if (cierreGrouping === 'Sin agrupar') return null;
    
    const groups = {};
    filteredItemRows.forEach(row => {
      let groupKey = 'Sin asignar';
      if (cierreGrouping === 'Hermano') {
        groupKey = row.owner || 'Sin asignar';
      } else if (cierreGrouping === 'Forma de pago') {
        if (row.allocatedCash > 0 && row.allocatedTransfer > 0) {
          groupKey = 'Pago Mixto';
        } else if (row.allocatedCash > 0) {
          groupKey = 'Efectivo';
        } else {
          groupKey = 'Transferencia';
        }
      } else if (cierreGrouping === 'Producto') {
        groupKey = row.productName;
      } else if (cierreGrouping === 'Tipo de documento') {
        groupKey = row.docType;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(row);
    });
    
    return Object.keys(groups).map(key => {
      const rows = groups[key];
      let totalVendido = 0;
      let totalEfectivo = 0;
      let totalTransferencia = 0;
      let totalPrendas = 0;
      
      rows.forEach(r => {
        totalVendido += r.total;
        totalEfectivo += r.allocatedCash;
        totalTransferencia += r.allocatedTransfer;
        totalPrendas += r.qty;
      });
      
      const numVentas = new Set(rows.map(r => r.saleId)).size;
      
      return {
        key,
        rows,
        totalVendido,
        totalEfectivo,
        totalTransferencia,
        totalPrendas,
        numVentas
      };
    });
  }, [filteredItemRows, cierreGrouping]);

  const handlePrintCierreThermal = (mode) => {
    const lines = [];
    lines.push({ text: "GRAVITY DENIM", size: 28, align: 1, bold: true });
    lines.push({ text: "Cierre de ventas", size: 18, align: 1, bold: true });
    lines.push({ text: `Fecha: ${formatECDate(cierreDate)}`, size: 16, align: 1 });
    lines.push({ text: `Impreso: ${new Date().toLocaleDateString('es-EC')} ${new Date().toLocaleTimeString('es-EC')}`, size: 16, align: 1 });
    
    let filtrosStr = "";
    if (cierreFilterDocType !== 'Todos') filtrosStr += `Doc:${cierreFilterDocType} `;
    if (cierreFilterPayment !== 'Todas') filtrosStr += `Pago:${cierreFilterPayment} `;
    if (cierreFilterEmitter !== 'Todos') filtrosStr += `Emisor:${cierreFilterEmitter} `;
    if (cierreFilterOwner !== 'Todos') filtrosStr += `Prop:${cierreFilterOwner} `;
    if (filtrosStr) {
      lines.push({ text: `Filtros: ${filtrosStr}`, size: 14, align: 1 });
    }
    lines.push({ text: "------------------------------------------------", size: 16, align: 1 });

    const padText = (left, right, width = 48) => {
      const space = width - left.length - right.length;
      return left + " ".repeat(Math.max(1, space)) + right;
    };

    if (mode === 'detalle') {
      lines.push({ text: "DETALLE DE PRODUCTOS VENDIDOS", size: 16, align: 1, bold: true });
      lines.push({ text: padText("CANT DETALLE", "TOTAL/PAGO", 48), size: 14, align: 0, bold: true });
      lines.push({ text: "------------------------------------------------", size: 16, align: 1 });
      
      filteredItemRows.forEach(row => {
        const cantStr = String(row.qty);
        const namePart = row.productName.substring(0, 16);
        const totalStr = `$${row.total.toFixed(2)}`;
        let payAbbr = row.paymentMethod === 'EFECTIVO' ? 'EF' : 'TR';
        if (row.isMixed) payAbbr = 'MX';
        
        const left = `${cantStr} ${namePart.padEnd(16, ' ')}`;
        const right = `${totalStr.padStart(8, ' ')} (${payAbbr})`;
        lines.push({ text: padText(left, right, 48), size: 14, align: 0 });
      });
      lines.push({ text: "------------------------------------------------", size: 16, align: 1 });
    }

    lines.push({ text: "RESUMEN DE TOTALES", size: 16, align: 1, bold: true });
    lines.push({ text: padText("Total Vendido:", `$${closureTotals.totalVendido.toFixed(2)}`, 48), size: 16, align: 0, bold: true });
    lines.push({ text: padText("Efectivo:", `$${closureTotals.totalEfectivo.toFixed(2)}`, 48), size: 14, align: 0 });
    lines.push({ text: padText("Transferencia:", `$${closureTotals.totalTransferencia.toFixed(2)}`, 48), size: 14, align: 0 });
    lines.push({ text: padText("Pagos Mixtos:", `$${closureTotals.totalPagosMixtos.toFixed(2)}`, 48), size: 14, align: 0 });
    lines.push({ text: padText("Total Facturas:", `$${closureTotals.totalFacturas.toFixed(2)}`, 48), size: 14, align: 0 });
    lines.push({ text: padText("Total Notas Venta:", `$${closureTotals.totalNotasVenta.toFixed(2)}`, 48), size: 14, align: 0 });
    lines.push({ text: padText("IVA Generado:", `$${closureTotals.totalIva.toFixed(2)}`, 48), size: 14, align: 0 });
    lines.push({ text: padText("Ventas Unicas:", String(closureTotals.numVentas), 48), size: 14, align: 0 });
    lines.push({ text: padText("Unidades Vendidas:", String(closureTotals.totalPrendas), 48), size: 14, align: 0 });
    
    lines.push({ text: "------------------------------------------------", size: 16, align: 1 });
    lines.push({ text: "TOTALES POR PROPIETARIO (PRODUCTOS)", size: 16, align: 1, bold: true });
    
    const brothers = ['Edgar', 'Fabián', 'Amparito'];
    if (filteredItemRows.some(r => r.owner === 'Pendiente')) {
      brothers.push('Pendiente');
    }
    brothers.forEach(b => {
      const bRows = filteredItemRows.filter(r => r.owner === b);
      const bTotal = bRows.reduce((sum, r) => sum + r.total, 0);
      const bCash = bRows.reduce((sum, r) => sum + r.allocatedCash, 0);
      const bTrans = bRows.reduce((sum, r) => sum + r.allocatedTransfer, 0);
      
      lines.push({ text: padText(`${b}:`, `$${bTotal.toFixed(2)}`, 48), size: 14, align: 0, bold: true });
      lines.push({ text: `  (Efec: $${bCash.toFixed(2)} | Transf: $${bTrans.toFixed(2)})`, size: 12, align: 0 });
    });
    
    lines.push({ text: "\n\n\n\n", size: 16, align: 1 });

    try {
      window.AndroidBridge.printTicket(JSON.stringify({ lines }));
    } catch (e) {
      alert("Error en impresión térmica: " + e.message);
    }
  };

  const handlePrintCierreBrowser = (mode, paperFormat) => {
    const win = window.open('', '_blank');
    if (!win) {
      alert("⚠️ El navegador bloqueó la ventana de impresión. Por favor, permita los pop-ups.");
      return;
    }
    
    let filtersStr = "";
    if (cierreFilterDocType !== 'Todos') filtersStr += `Documento: ${cierreFilterDocType} | `;
    if (cierreFilterPayment !== 'Todas') filtersStr += `Pago: ${cierreFilterPayment} | `;
    if (cierreFilterEmitter !== 'Todos') filtersStr += `Emisor: ${cierreFilterEmitter} | `;
    if (cierreFilterOwner !== 'Todos') filtersStr += `Propietario: ${cierreFilterOwner} | `;

    const abbreviateClient = (name) => {
      if (!name) return 'CF';
      const upper = name.toUpperCase().trim();
      if (upper === 'CONSUMIDOR FINAL') return 'CF';
      return name;
    };
    
    const abbreviatePayment = (method) => {
      if (!method) return 'EF';
      const upper = method.toUpperCase().trim();
      if (upper === 'TRANSFERENCIA') return 'TR';
      if (upper === 'EFECTIVO') return 'EF';
      if (upper === 'PAGO MIXTO' || upper === 'MIXTO') return 'MX';
      return method;
    };
    
    const abbreviateOwner = (owner) => {
      if (!owner) return 'ED';
      const lower = owner.toLowerCase().trim();
      if (lower.includes('fabian') || lower.includes('fabián')) return 'FB';
      if (lower.includes('ampar') || lower.includes('deysi')) return 'AM';
      if (lower.includes('edgar') || lower.includes('geovanny')) return 'ED';
      return owner;
    };

    let styleHtml = '';
    if (paperFormat === '80mm') {
      styleHtml = `
        body { 
          font-family: Arial, sans-serif; 
          font-size: 11px; 
          color: black; 
          padding: 2mm 3mm; 
          margin: 0; 
          width: 80mm; 
          box-sizing: border-box; 
        }
        .header { text-align: center; margin-bottom: 12px; }
        .header h1 { margin: 0; font-size: 16px; text-transform: uppercase; font-weight: bold; }
        .header h2 { margin: 3px 0; font-size: 11px; color: #555; font-weight: normal; }
        .meta-info { 
          margin-bottom: 12px; 
          font-size: 9px; 
          border-bottom: 1px dashed #ccc; 
          padding-bottom: 5px; 
          line-height: 1.4; 
        }
        .meta-info-row { 
          display: flex; 
          justify-content: space-between; 
          gap: 10px; 
        }
        .totals-grid { 
          display: grid; 
          grid-template-columns: repeat(2, 1fr); 
          gap: 6px; 
          margin-bottom: 15px; 
        }
        .total-card { 
          border: 1px solid #ccc; 
          padding: 5px; 
          border-radius: 4px; 
          text-align: center; 
          background-color: #fafafa; 
        }
        .total-card p { margin: 0 0 3px 0; font-size: 8px; color: #555; text-transform: uppercase; }
        .total-card h3 { margin: 0; font-size: 12px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; break-inside: avoid; }
        th, td { border: 1px solid #ccc; padding: 4px 3px; text-align: left; font-size: 8.5px; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .nowrap { white-space: nowrap; }
        .section-title { 
          font-size: 10.5px; 
          font-weight: bold; 
          margin: 12px 0 5px 0; 
          border-bottom: 1.5px solid #333; 
          padding-bottom: 2px; 
          text-transform: uppercase; 
        }

        @media print {
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
          body {
            width: 80mm;
            margin: 0;
            padding: 2mm 3mm;
          }
        }
      `;
    } else {
      styleHtml = `
        body { 
          font-family: Arial, sans-serif; 
          font-size: 12px; 
          color: black; 
          padding: 20px; 
        }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
        .header h2 { margin: 5px 0; font-size: 18px; color: #555; }
        .meta-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 11px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
        .totals-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        .total-card { border: 1px solid #ccc; padding: 10px; border-radius: 6px; text-align: center; }
        .total-card p { margin: 0 0 5px 0; font-size: 10px; color: #666; text-transform: uppercase; }
        .total-card h3 { margin: 0; font-size: 16px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .section-title { font-size: 14px; font-weight: bold; margin: 15px 0 10px 0; border-bottom: 2px solid #333; padding-bottom: 4px; }
      `;
    }

    let bodyHtml = `
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Cierre de Caja - Gravity Denim</title>
        <style>
          ${styleHtml}
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="header">
          <h1>GRAVITY DENIM</h1>
          <h2>Cierre de Caja - Ventas Diarias</h2>
        </div>
        
        <div class="meta-info">
          <div class="meta-info-row">
            <span><strong>Fecha Cierre:</strong> ${formatECDate(cierreDate)}</span>
            <span><strong>Impreso:</strong> ${new Date().toLocaleString('es-EC')}</span>
          </div>
          <div class="meta-info-row" style="margin-top: 3px;">
            <span><strong>Filtros:</strong> ${filtersStr || 'Ninguno'}</span>
            <span><strong>Usuario:</strong> Sistema POS</span>
          </div>
        </div>
        
        <div class="totals-grid">
          <div class="total-card">
            <p>Total Vendido</p>
            <h3>$${closureTotals.totalVendido.toFixed(2)}</h3>
          </div>
          <div class="total-card">
            <p>Efectivo</p>
            <h3>$${closureTotals.totalEfectivo.toFixed(2)}</h3>
          </div>
          <div class="total-card">
            <p>Transferencia</p>
            <h3>$${closureTotals.totalTransferencia.toFixed(2)}</h3>
          </div>
          <div class="total-card">
            <p>Pagos Mixtos</p>
            <h3>$${closureTotals.totalPagosMixtos.toFixed(2)}</h3>
          </div>
          <div class="total-card">
            <p>Unidades Vendidas</p>
            <h3>${closureTotals.totalPrendas}</h3>
          </div>
          <div class="total-card">
            <p>Transacciones</p>
            <h3>${closureTotals.numVentas}</h3>
          </div>
        </div>
    `;

    bodyHtml += `
      <div class="section-title">Totales por Propietario (Productos)</div>
      <table>
        <thead>
          <tr>
            <th>Propietario / Hermano</th>
            <th class="text-right">Efectivo</th>
            <th class="text-right">Transferencia</th>
            <th class="text-right">Total Vendido</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    const brothers = ['Edgar', 'Fabián', 'Amparito'];
    if (filteredItemRows.some(r => r.owner === 'Pendiente')) {
      brothers.push('Pendiente');
    }
    
    brothers.forEach(b => {
      const bRows = filteredItemRows.filter(r => r.owner === b);
      const bTotal = bRows.reduce((sum, r) => sum + r.total, 0);
      const bCash = bRows.reduce((sum, r) => sum + r.allocatedCash, 0);
      const bTrans = bRows.reduce((sum, r) => sum + r.allocatedTransfer, 0);
      
      const displayName = paperFormat === '80mm' ? abbreviateOwner(b) : b;
      
      bodyHtml += `
        <tr>
          <td><strong>${displayName}</strong></td>
          <td class="text-right">$${bCash.toFixed(2)}</td>
          <td class="text-right">$${bTrans.toFixed(2)}</td>
          <td class="text-right bold">$${bTotal.toFixed(2)}</td>
        </tr>
      `;
    });
    bodyHtml += `
        </tbody>
      </table>
    `;

    if (mode === 'detalle') {
      bodyHtml += `
        <div class="section-title">Detalle de Productos Vendidos</div>
      `;
      
      if (cierreGrouping === 'Sin agrupar') {
        if (paperFormat === '80mm') {
          bodyHtml += `
            <table>
              <thead>
                <tr>
                  <th style="width: 15%;">Cliente</th>
                  <th style="width: 45%;">Producto</th>
                  <th style="width: 10%;">Cant</th>
                  <th style="width: 15%; text-align: right;">Total</th>
                  <th style="width: 10%;">Pago</th>
                  <th style="width: 5%;">Prop</th>
                </tr>
              </thead>
              <tbody>
          `;
          filteredItemRows.forEach(r => {
            bodyHtml += `
              <tr>
                <td class="nowrap">${abbreviateClient(r.clientName)}</td>
                <td>${r.productName}</td>
                <td class="nowrap">${r.qty}</td>
                <td class="text-right nowrap">$${r.total.toFixed(2)}</td>
                <td class="nowrap">${abbreviatePayment(r.paymentMethod)}</td>
                <td class="nowrap">${abbreviateOwner(r.owner)}</td>
              </tr>
            `;
          });
        } else {
          bodyHtml += `
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Documento</th>
                  <th>N.º</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Cant</th>
                  <th class="text-right">Unitario</th>
                  <th class="text-right">Total</th>
                  <th>Pago</th>
                  <th>Propietario</th>
                </tr>
              </thead>
              <tbody>
          `;
          filteredItemRows.forEach(r => {
            bodyHtml += `
              <tr>
                <td>${r.time}</td>
                <td>${r.docType}</td>
                <td>${r.docNo}</td>
                <td>${r.clientName}</td>
                <td>${r.productName}</td>
                <td>${r.qty}</td>
                <td class="text-right">$${r.unitPrice.toFixed(2)}</td>
                <td class="text-right">$${r.total.toFixed(2)}</td>
                <td>${r.paymentMethod}</td>
                <td>${r.owner}</td>
              </tr>
            `;
          });
        }
        bodyHtml += `
            </tbody>
          </table>
        `;
      } else {
        groupedSections.forEach(group => {
          bodyHtml += `
            <div style="font-weight: bold; margin-top: 10px; margin-bottom: 5px;">Grupo: ${group.key} (Total: $${group.totalVendido.toFixed(2)})</div>
          `;
          if (paperFormat === '80mm') {
            bodyHtml += `
              <table>
                <thead>
                  <tr>
                    <th style="width: 15%;">Cliente</th>
                    <th style="width: 45%;">Producto</th>
                    <th style="width: 10%;">Cant</th>
                    <th style="width: 15%; text-align: right;">Total</th>
                    <th style="width: 10%;">Pago</th>
                    <th style="width: 5%;">Prop</th>
                  </tr>
                </thead>
                <tbody>
            `;
            group.rows.forEach(r => {
              bodyHtml += `
                <tr>
                  <td class="nowrap">${abbreviateClient(r.clientName)}</td>
                  <td>${r.productName}</td>
                  <td class="nowrap">${r.qty}</td>
                  <td class="text-right nowrap">$${r.total.toFixed(2)}</td>
                  <td class="nowrap">${abbreviatePayment(r.paymentMethod)}</td>
                  <td class="nowrap">${abbreviateOwner(r.owner)}</td>
                </tr>
              `;
            });
          } else {
            bodyHtml += `
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Documento</th>
                    <th>N.º</th>
                    <th>Cliente</th>
                    <th>Producto</th>
                    <th>Cant</th>
                    <th class="text-right">Unitario</th>
                    <th class="text-right">Total</th>
                    <th>Pago</th>
                    <th>Propietario</th>
                  </tr>
                </thead>
                <tbody>
            `;
            group.rows.forEach(r => {
              bodyHtml += `
                <tr>
                  <td>${r.time}</td>
                  <td>${r.docType}</td>
                  <td>${r.docNo}</td>
                  <td>${r.clientName}</td>
                  <td>${r.productName}</td>
                  <td>${r.qty}</td>
                  <td class="text-right">$${r.unitPrice.toFixed(2)}</td>
                  <td class="text-right">$${r.total.toFixed(2)}</td>
                  <td>${r.paymentMethod}</td>
                  <td>${r.owner}</td>
                </tr>
              `;
            });
          }
          bodyHtml += `
              </tbody>
            </table>
          `;
        });
      }
    }
    
    bodyHtml += `
      </body>
      </html>
    `;
    win.document.write(bodyHtml);
    win.document.close();
  };

  const handlePrintCierre = (mode) => {
    if (typeof window !== 'undefined' && window.AndroidBridge) {
      handlePrintCierreThermal(mode);
    } else {
      handlePrintCierreBrowser(mode, cierrePaperFormat);
    }
  };

  const formatECDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const handlePrevDay = () => {
    const d = new Date(cierreDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setCierreDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(cierreDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setCierreDate(d.toISOString().slice(0, 10));
  };

  const handleSetToday = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ecDate = new Date(utc + (3600000 * -5));
    setCierreDate(ecDate.toISOString().slice(0, 10));
  };

  const handleClearCierreFilters = () => {
    setCierreFilterDocType('Todos');
    setCierreFilterPayment('Todas');
    setCierreFilterEmitter('Todos');
    setCierreFilterOwner('Todos');
    setCierreFilterClientText('');
    setCierreFilterProductText('');
    setCierreGrouping('Sin agrupar');
  };

  const exportCierreCSV = () => {
    const headers = [
      "Hora",
      "Documento",
      "N.o",
      "Cliente",
      "Identificacion",
      "Producto",
      "Cantidad",
      "V. Unitario",
      "Subtotal",
      "IVA",
      "Total",
      "Efectivo Asignado",
      "Transf. Asignada",
      "Pago General",
      "Hermano Propietario",
      "Emisor Venta"
    ];
    
    const rows = [];
    
    if (cierreGrouping === 'Sin agrupar') {
      filteredItemRows.forEach(r => {
        rows.push([
          `"${r.time}"`,
          `"${r.docType}"`,
          `"${r.docNo}"`,
          `"${r.clientName.replace(/"/g, '""')}"`,
          `"${r.clientId}"`,
          `"${r.productName.replace(/"/g, '""')}"`,
          r.qty,
          r.unitPrice.toFixed(2),
          r.subtotal.toFixed(2),
          r.iva.toFixed(2),
          r.total.toFixed(2),
          r.allocatedCash.toFixed(2),
          r.allocatedTransfer.toFixed(2),
          `"${r.paymentMethod}"`,
          `"${r.owner}"`,
          `"${r.emitterShort}"`
        ].join(","));
      });
    } else {
      groupedSections.forEach(group => {
        rows.push(`"--- GRUPO: ${group.key.toUpperCase()} ---",,,,,,,,,,,,,,,`);
        group.rows.forEach(r => {
          rows.push([
            `"${r.time}"`,
            `"${r.docType}"`,
            `"${r.docNo}"`,
            `"${r.clientName.replace(/"/g, '""')}"`,
            `"${r.clientId}"`,
            `"${r.productName.replace(/"/g, '""')}"`,
            r.qty,
            r.unitPrice.toFixed(2),
            r.subtotal.toFixed(2),
            r.iva.toFixed(2),
            r.total.toFixed(2),
            r.allocatedCash.toFixed(2),
            r.allocatedTransfer.toFixed(2),
            `"${r.paymentMethod}"`,
            `"${r.owner}"`,
            `"${r.emitterShort}"`
          ].join(","));
        });
        rows.push(`"TOTAL GRUPO",,,,,,,"${group.totalVendido.toFixed(2)}",,,,,,,`);
      });
    }
    
    const csvContent = headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Cierre_Diario_${cierreDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // =========================================================================
  // --- FIN DE LÓGICA DE CIERRE DIARIO ---
  // =========================================================================

  // =========================================================================
  // =========================================================================
  // --- LÓGICA DEL MÓDULO RESUMEN PARA CONTADORA (REPORTE TRIBUTARIO POR RANGO DE FECHAS) ---
  // =========================================================================================
  const getTodayStr = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ecDate = new Date(utc + (3600000 * -5));
    return ecDate.toISOString().slice(0, 10);
  };

  const getFirstDayOfMonthStr = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ecDate = new Date(utc + (3600000 * -5));
    const year = ecDate.getFullYear();
    const month = String(ecDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };

  const [contadoraIssuerId, setContadoraIssuerId] = useState('TODOS');
  const [contadoraStartDate, setContadoraStartDate] = useState(getFirstDayOfMonthStr);
  const [contadoraEndDate, setContadoraEndDate] = useState(getTodayStr);

  // Fechas aplicadas mediante botón "Aplicar"
  const [appliedStartDate, setAppliedStartDate] = useState(getFirstDayOfMonthStr);
  const [appliedEndDate, setAppliedEndDate] = useState(getTodayStr);

  const [contadoraDocTypeFilter, setContadoraDocTypeFilter] = useState('Todos'); // 'Todos' | 'Factura' | 'Nota de venta'
  const [contadoraStatusFilter, setContadoraStatusFilter] = useState('Todos'); // 'Todos' | 'Valida' | 'Anulada'
  const [contadoraPaymentFilter, setContadoraPaymentFilter] = useState('Todos'); // 'Todos' | 'EFECTIVO' | 'TRANSFERENCIA' | 'MIXTO'
  const [contadoraSearchText, setContadoraSearchText] = useState('');
  const [contadoraProductSearchText, setContadoraProductSearchText] = useState('');

  const handleApplyRange = () => {
    setAppliedStartDate(contadoraStartDate);
    setAppliedEndDate(contadoraEndDate);
  };

  const handleResetRange = () => {
    const defaultStart = getFirstDayOfMonthStr();
    const defaultEnd = getTodayStr();
    setContadoraStartDate(defaultStart);
    setContadoraEndDate(defaultEnd);
    setAppliedStartDate(defaultStart);
    setAppliedEndDate(defaultEnd);
    setContadoraDocTypeFilter('Todos');
    setContadoraStatusFilter('Todos');
    setContadoraPaymentFilter('Todos');
    setContadoraSearchText('');
    setContadoraProductSearchText('');
  };

  const handlePresetHoy = () => {
    const today = getTodayStr();
    setContadoraStartDate(today);
    setContadoraEndDate(today);
    setAppliedStartDate(today);
    setAppliedEndDate(today);
  };

  const handlePresetEstaSemana = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ecDate = new Date(utc + (3600000 * -5));
    const dayOfWeek = ecDate.getDay();
    const diffToMonday = ecDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(ecDate.setDate(diffToMonday));
    const mondayStr = monday.toISOString().slice(0, 10);
    const todayStr = getTodayStr();

    setContadoraStartDate(mondayStr);
    setContadoraEndDate(todayStr);
    setAppliedStartDate(mondayStr);
    setAppliedEndDate(todayStr);
  };

  const handlePresetEstaQuincena = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ecDate = new Date(utc + (3600000 * -5));
    const year = ecDate.getFullYear();
    const month = String(ecDate.getMonth() + 1).padStart(2, '0');
    const day = ecDate.getDate();

    let startStr, endStr;
    if (day <= 15) {
      startStr = `${year}-${month}-01`;
      endStr = `${year}-${month}-15`;
    } else {
      startStr = `${year}-${month}-16`;
      const lastDay = new Date(year, ecDate.getMonth() + 1, 0).getDate();
      endStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    }

    setContadoraStartDate(startStr);
    setContadoraEndDate(endStr);
    setAppliedStartDate(startStr);
    setAppliedEndDate(endStr);
  };

  const handlePresetEsteMes = () => {
    const startStr = getFirstDayOfMonthStr();
    const todayStr = getTodayStr();
    setContadoraStartDate(startStr);
    setContadoraEndDate(todayStr);
    setAppliedStartDate(startStr);
    setAppliedEndDate(todayStr);
  };

  const contadoraData = useMemo(() => {
    const selectedIssuer = (issuers || []).find(i => i.id === contadoraIssuerId) || null;

    // 1. Filtrado por Emisor / RUC (TODOS o Emisor Específico)
    const issuerSales = (sales || []).filter(sale => {
      if (contadoraIssuerId === 'TODOS') return true;
      const saleEmisorId = sale.emisorId || sale.issuerId;
      if (saleEmisorId) return saleEmisorId === contadoraIssuerId;
      if (selectedIssuer && (sale.emisorRuc || sale.issuerRuc)) {
        return (sale.emisorRuc || sale.issuerRuc) === selectedIssuer.ruc;
      }
      return false;
    });

    // 2. Filtrado de Período por Rango de Fechas Inclusivo (T00:00:00 a T23:59:59.999)
    const start = appliedStartDate ? new Date(`${appliedStartDate}T00:00:00.000`) : new Date('2000-01-01');
    const end = appliedEndDate ? new Date(`${appliedEndDate}T23:59:59.999`) : new Date('2099-12-31');

    const periodSales = issuerSales.filter(sale => {
      const fiscalDate = getSaleFiscalDate(sale);
      if (!fiscalDate) return false;
      return fiscalDate >= start && fiscalDate <= end;
    });

    const sStr = start.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const eStr = end.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const periodStr = `${sStr} al ${eStr}`;

    // 3. Procesamiento y Acumulación Tributaria
    let numFacturas = 0;
    let numNotasVenta = 0;
    let numAnulados = 0;

    let subtotal15 = 0;
    let subtotal0 = 0;
    let iva15 = 0;
    let totalVentas = 0;

    let totalEfectivo = 0;
    let totalTransferencias = 0;
    let totalPagosMixtos = 0;

    const vouchers = periodSales.map(sale => {
      const fiscalDate = getSaleFiscalDate(sale);
      const fechaStr = fiscalDate ? fiscalDate.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';

      const isNC = Boolean(sale.isNotaCredito || sale.tipoComprobante === 'NOTA_CREDITO' || sale.estadoVenta === 'NOTA_CREDITO');
      const isNota = Boolean(sale.isNotaVenta || sale.estadoSri === 'NOTA_DE_VENTA' || sale.status === 'NOTA_DE_VENTA' || sale.tipoComprobante === 'NOTA_DE_VENTA');
      const docType = isNC ? 'Nota de crédito' : isNota ? 'Nota de venta' : 'Factura';

      // REGLA ESTRICTA DE ANULADOS / REVERTIDOS:
      // Se consideran sin efecto de venta si estado es ANULADO, ANULADA, ANULADA_SRI, REVERTIDA_NC, o si es una Nota de Crédito.
      const sriState = (sale.estadoSri || sale.status || sale.estadoVenta || '').toString().toUpperCase();
      const isAnulado = sriState === 'ANULADO' || sriState === 'ANULADA' || sriState === 'ANULADA_SRI' || sriState === 'REVERTIDA_NC' || sale.anulado === true || sale.notaCreditoEmitida === true || isNC;

      const numeroComprobante = sale.numeroComprobante || sale.secuencial || 'S/N';
      const clienteNombre = (sale.cliente || sale.customer)?.nombre || 'CONSUMIDOR FINAL';
      const clienteRuc = (sale.cliente || sale.customer)?.numeroIdentificacion || '9999999999999';

      const saleSubtotal = Number(sale.totals?.subtotal !== undefined ? sale.totals.subtotal : (sale.subtotalSinImpuestos !== undefined ? sale.subtotalSinImpuestos : (sale.subtotal || 0)));
      const saleIva = Number(sale.totals?.ivaAmount !== undefined ? sale.totals.ivaAmount : (sale.totals?.iva !== undefined ? sale.totals.iva : (sale.valorIva || sale.montoIva || 0)));
      const saleTotal = Number(sale.totals?.total !== undefined ? sale.totals.total : (sale.totals?.grandTotal !== undefined ? sale.totals.grandTotal : (sale.importeTotal || sale.total || 0)));

      let vSubtotal15 = 0;
      let vSubtotal0 = 0;

      if (sale.subtotal15 !== undefined) {
        vSubtotal15 = Number(sale.subtotal15) || 0;
      } else if (saleIva > 0) {
        vSubtotal15 = saleSubtotal;
      }

      if (sale.subtotal0 !== undefined) {
        vSubtotal0 = Number(sale.subtotal0) || 0;
      } else if (saleIva === 0) {
        vSubtotal0 = saleSubtotal;
      }

      const pMethod = (sale.paymentMethod || sale.paymentDetails?.payments?.[0]?.method || 'EFECTIVO').toString().toUpperCase();
      const isMixto = Boolean(sale.paymentDetails?.payments && sale.paymentDetails.payments.length > 1);
      const displayPayment = isMixto ? 'MIXTO' : pMethod.includes('TRANSFER') ? 'TRANSFERENCIA' : 'EFECTIVO';

      if (isAnulado) {
        numAnulados++;
      } else {
        if (isNota) {
          numNotasVenta++;
        } else {
          numFacturas++;
        }

        subtotal15 += vSubtotal15;
        subtotal0 += vSubtotal0;
        iva15 += saleIva;
        totalVentas += saleTotal;

        if (isMixto) {
          totalPagosMixtos += saleTotal;
        } else if (pMethod.includes('TRANSFER')) {
          totalTransferencias += saleTotal;
        } else {
          totalEfectivo += saleTotal;
        }
      }

      return {
        id: sale.id,
        fecha: fechaStr,
        fiscalDate,
        docType,
        numeroComprobante,
        clienteNombre,
        clienteRuc,
        subtotal: saleSubtotal,
        vSubtotal15,
        vSubtotal0,
        iva: saleIva,
        total: saleTotal,
        isAnulado,
        estado: isAnulado ? 'Anulada' : 'Válida',
        pMethod: displayPayment,
        rawSale: sale
      };
    });

    vouchers.sort((a, b) => (a.fiscalDate?.getTime() || 0) - (b.fiscalDate?.getTime() || 0));

    // Filtros secundarios en la UI
    const filteredVouchers = vouchers.filter(v => {
      if (contadoraDocTypeFilter !== 'Todos' && v.docType !== contadoraDocTypeFilter) return false;
      if (contadoraStatusFilter !== 'Todos') {
        if (contadoraStatusFilter === 'Valida' && v.isAnulado) return false;
        if (contadoraStatusFilter === 'Anulada' && !v.isAnulado) return false;
      }
      if (contadoraPaymentFilter !== 'Todos' && v.pMethod !== contadoraPaymentFilter) return false;

      if (contadoraSearchText.trim() !== '') {
        const query = contadoraSearchText.toLowerCase();
        const matchName = v.clienteNombre.toLowerCase().includes(query);
        const matchId = v.clienteRuc.toLowerCase().includes(query);
        const matchDoc = v.numeroComprobante.toLowerCase().includes(query);
        if (!matchName && !matchId && !matchDoc) return false;
      }

      if (contadoraProductSearchText.trim() !== '') {
        const pQuery = contadoraProductSearchText.toLowerCase();
        const prods = v.rawSale.productos || v.rawSale.items || [];
        const hasProdMatch = prods.some(p => {
          const pName = (p.name || p.nombre || '').toLowerCase();
          const pSku = (p.sku || p.codigo || p.codigoBarras || '').toLowerCase();
          return pName.includes(pQuery) || pSku.includes(pQuery);
        });
        if (!hasProdMatch) return false;
      }

      return true;
    });

    return {
      selectedIssuer,
      periodStr,
      filteredVouchers,
      allVouchers: vouchers,
      totals: {
        totalVentas: Number(totalVentas.toFixed(2)),
        subtotal15: Number(subtotal15.toFixed(2)),
        subtotal0: Number(subtotal0.toFixed(2)),
        iva15: Number(iva15.toFixed(2)),
        numFacturas,
        numNotasVenta,
        numAnulados,
        totalEfectivo: Number(totalEfectivo.toFixed(2)),
        totalTransferencias: Number(totalTransferencias.toFixed(2)),
        totalPagosMixtos: Number(totalPagosMixtos.toFixed(2))
      }
    };
  }, [sales, issuers, contadoraIssuerId, appliedStartDate, appliedEndDate, contadoraDocTypeFilter, contadoraStatusFilter, contadoraPaymentFilter, contadoraSearchText, contadoraProductSearchText]);

  // Exportación a Excel nativo (.xlsx) mediante librería SheetJS (xlsx)
  const exportContadoraXLSX = () => {
    if (!contadoraData.selectedIssuer) {
      alert("⚠️ Seleccione un emisor para exportar.");
      return;
    }

    try {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      const issuerName = contadoraData.selectedIssuer.razonSocial || contadoraData.selectedIssuer.name || 'Emisor';
      const issuerRuc = contadoraData.selectedIssuer.ruc || 'S/N';
      const period = contadoraData.periodStr;

      // Hoja 1: Resumen Tributario
      const summaryData = [
        ["REPORTE TRIBUTARIO - RESUMEN PARA CONTADORA"],
        ["GRAVITY DENIM POS - MULTIEMISOR"],
        [""],
        ["EMISOR:", issuerName],
        ["RUC EMISOR:", issuerRuc],
        ["PERIODO DECLARADO:", period],
        ["FECHA DE GENERACIÓN:", new Date().toLocaleString('es-EC')],
        [""],
        ["RESUMEN DE COMPROBANTES Y VALORES FISCALES"],
        ["Indicador / Concepto", "Valor / Cantidad"],
        ["Facturas Emitidas Válidas", contadoraData.totals.numFacturas],
        ["Notas de Venta Emitidas Válidas", contadoraData.totals.numNotasVenta],
        ["Comprobantes Anulados", contadoraData.totals.numAnulados],
        ["Subtotal Gravado (Tarifa 15%)", contadoraData.totals.subtotal15],
        ["Subtotal Tarifa 0%", contadoraData.totals.subtotal0],
        ["Monto IVA 15%", contadoraData.totals.iva15],
        ["Total de Ventas Neta", contadoraData.totals.totalVentas]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 35 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen Tributario");

      // Hoja 2: Detalle de Comprobantes
      const detailHeader = [
        "Fecha",
        "Tipo Comprobante",
        "Número Comprobante",
        "Cliente",
        "RUC/Cédula",
        "Subtotal 15%",
        "Subtotal 0%",
        "Subtotal Total",
        "IVA 15%",
        "Total",
        "Estado"
      ];

      const detailRows = contadoraData.filteredVouchers.map(v => [
        v.fecha,
        v.docType,
        v.numeroComprobante,
        v.clienteNombre,
        v.clienteRuc,
        v.isAnulado ? 0 : v.vSubtotal15,
        v.isAnulado ? 0 : v.vSubtotal0,
        v.isAnulado ? 0 : v.subtotal,
        v.isAnulado ? 0 : v.iva,
        v.isAnulado ? 0 : v.total,
        v.estado
      ]);

      const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
      wsDetail['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 30 },
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 12 }, { wch: 14 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle Comprobantes");

      const cleanName = (contadoraData.selectedIssuer.shortName || 'Emisor').replace(/\s+/g, '_');
      const filename = `Resumen_Contadora_${cleanName}_${contadoraMonth}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Error al exportar a Excel:", err);
      alert("Error al generar el archivo Excel: " + err.message);
    }
  };

  // Exportación a PDF / Vista de Impresión estructurada A4
  const exportContadoraPDF = () => {
    if (!contadoraData.selectedIssuer) {
      alert("⚠️ Seleccione un emisor para exportar.");
      return;
    }

    const win = window.open('', '_blank');
    if (!win) {
      alert("⚠️ El navegador bloqueó la ventana emergente de impresión PDF. Por favor, permita las ventanas emergentes.");
      return;
    }

    const issuerName = contadoraData.selectedIssuer.razonSocial || contadoraData.selectedIssuer.name || 'Emisor';
    const issuerRuc = contadoraData.selectedIssuer.ruc || 'S/N';
    const period = contadoraData.periodStr;

    let rowsHtml = '';
    contadoraData.filteredVouchers.forEach(v => {
      const isAnul = v.isAnulado;
      rowsHtml += `
        <tr class="${isAnul ? 'anulada-row' : ''}">
          <td>${v.fecha}</td>
          <td>${v.docType}</td>
          <td>${v.numeroComprobante}</td>
          <td>${v.clienteNombre}</td>
          <td>${v.clienteRuc}</td>
          <td class="text-right">$${isAnul ? '0.00' : v.subtotal.toFixed(2)}</td>
          <td class="text-right">$${isAnul ? '0.00' : v.iva.toFixed(2)}</td>
          <td class="text-right bold">$${isAnul ? '0.00' : v.total.toFixed(2)}</td>
          <td class="text-center ${isAnul ? 'status-anulada' : 'status-valida'}">${v.estado}</td>
        </tr>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Resumen Tributario - ${issuerName} - ${period}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 0; }
          .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 12px; }
          .header h1 { margin: 0; font-size: 18px; color: #1e3a8a; text-transform: uppercase; }
          .header h2 { margin: 3px 0 0 0; font-size: 12px; color: #475569; }
          .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 12px; }
          .meta-item strong { color: #334155; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
          .kpi-card { border: 1px solid #cbd5e1; background: #ffffff; padding: 8px; border-radius: 6px; text-align: center; }
          .kpi-card p { margin: 0 0 3px 0; font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: bold; }
          .kpi-card h3 { margin: 0; font-size: 13px; font-weight: bold; color: #0f172a; }
          .section-title { font-size: 11.5px; font-weight: bold; color: #1e293b; margin: 14px 0 6px 0; border-bottom: 1px solid #94a3b8; padding-bottom: 3px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; font-size: 9.5px; }
          th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .anulada-row { background-color: #fef2f2; color: #991b1b; }
          .status-valida { color: #166534; font-weight: bold; }
          .status-anulada { color: #991b1b; font-weight: bold; }
          .footer { margin-top: 15px; text-align: center; font-size: 8.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
        </style>
      </head>
      <body onload="window.print();">
        <div class="header">
          <h1>GRAVITY DENIM POS - RESUMEN PARA CONTADORA</h1>
          <h2>Informe Tributario Mensual por Emisor (SRI Ecuador)</h2>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><strong>Emisor / Razón Social:</strong> ${issuerName}</div>
          <div class="meta-item"><strong>RUC Emisor:</strong> ${issuerRuc}</div>
          <div class="meta-item"><strong>Periodo Declarado:</strong> ${period}</div>
          <div class="meta-item"><strong>Fecha Generación:</strong> ${new Date().toLocaleString('es-EC')}</div>
        </div>

        <div class="section-title">Resumen de Comprobantes y Bases Imponibles</div>
        <div class="kpi-grid">
          <div class="kpi-card"><p>Facturas Emitidas</p><h3>${contadoraData.totals.numFacturas}</h3></div>
          <div class="kpi-card"><p>Notas de Venta</p><h3>${contadoraData.totals.numNotasVenta}</h3></div>
          <div class="kpi-card"><p>Comprobantes Anulados</p><h3>${contadoraData.totals.numAnulados}</h3></div>
          <div class="kpi-card"><p>Total Ventas Neta</p><h3>$${contadoraData.totals.totalVentas.toFixed(2)}</h3></div>
          <div class="kpi-card"><p>Subtotal Gravado (15%)</p><h3>$${contadoraData.totals.subtotal15.toFixed(2)}</h3></div>
          <div class="kpi-card"><p>Subtotal Tarifa 0%</p><h3>$${contadoraData.totals.subtotal0.toFixed(2)}</h3></div>
          <div class="kpi-card"><p>Monto IVA 15%</p><h3>$${contadoraData.totals.iva15.toFixed(2)}</h3></div>
          <div class="kpi-card"><p>Total Comprobantes</p><h3>${contadoraData.allVouchers.length}</h3></div>
        </div>

        <div class="section-title">Detalle de Comprobantes del Periodo</div>
        <table>
          <thead>
            <tr>
              <th style="width: 10%;">Fecha</th>
              <th style="width: 12%;">Tipo</th>
              <th style="width: 18%;">Comprobante N.º</th>
              <th style="width: 24%;">Cliente</th>
              <th style="width: 14%;">RUC / Cédula</th>
              <th style="width: 8%; text-align: right;">Subtotal</th>
              <th style="width: 6%; text-align: right;">IVA</th>
              <th style="width: 8%; text-align: right;">Total</th>
              <th style="width: 0%; text-align: center;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          Documento generado automáticamente por Gravity Denim POS - Informe preparado para declaración mensual de impuestos SRI Ecuador.
        </div>
      </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="report-container animate-fade-in" style={{ padding: '2rem' }}>
      <style>{`
        .pos-table th, .pos-table td {
          padding: 14px 18px !important;
          text-align: left;
          vertical-align: middle;
          white-space: nowrap;
        }
      `}</style>
      {/* Pestañas de Navegación Principal: Resumen para Contadora vs Reporte General */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', marginBottom: '2rem', gap: '1rem' }}>
        <button
          onClick={() => setMainTab('contadora')}
          style={{
            padding: '1rem 2rem',
            background: 'transparent',
            border: 'none',
            borderBottom: mainTab === 'contadora' ? '3px solid #10b981' : '3px solid transparent',
            color: mainTab === 'contadora' ? '#10b981' : 'var(--text-muted)',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FileText size={20} /> Resumen para Contadora (Reporte Tributario)
        </button>
        <button
          onClick={() => setMainTab('general')}
          style={{
            padding: '1rem 2rem',
            background: 'transparent',
            border: 'none',
            borderBottom: mainTab === 'general' ? '3px solid var(--accent)' : '3px solid transparent',
            color: mainTab === 'general' ? 'white' : 'var(--text-muted)',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <BarChart3 size={20} /> Reporte general y Cierre por Hermano
        </button>
      </div>

      {mainTab === 'general' ? (
        <>
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
            📊 Reporte General de Ventas
          </button>
          <button 
            onClick={() => setActiveTab('notas_venta')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'notas_venta' ? '#f59e0b' : 'transparent', border: '1px solid #f59e0b', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🧾 Historial de Notas de Venta
          </button>
          <button 
            onClick={() => setActiveTab('cierre_hermano')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'cierre_hermano' ? '#6366f1' : 'transparent', border: '1px solid #6366f1', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            👥 Cierre por Hermano
          </button>
        </div>
      </div>

      {activeTab === 'sri' && (
        <>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        
        {/* KPI: Facturas Emitidas */}
        <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '50%', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.2rem 0' }}>Facturas Emitidas</p>
            <h3 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 'bold', color: 'white' }}>{numFacturasMes}</h3>
          </div>
        </div>

        {/* KPI: Notas de Venta */}
        <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '50%', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.2rem 0' }}>Notas de Venta</p>
            <h3 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 'bold', color: 'white' }}>{numNotasMes}</h3>
          </div>
        </div>

        {/* KPI: Ventas del Mes */}
        <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '50%', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.2rem 0' }}>Ventas del Mes</p>
            <h3 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${currentMonthTotal.toFixed(2)}</h3>
          </div>
        </div>

        {/* KPI: IVA Declarado */}
        <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '50%', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Percent size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.2rem 0' }}>IVA Declarado</p>
            <h3 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${currentMonthIVA.toFixed(2)}</h3>
          </div>
        </div>

        {/* KPI: Promedio por Venta */}
        <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ padding: '12px', background: 'rgba(168, 85, 247, 0.15)', borderRadius: '50%', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.2rem 0' }}>Promedio por Venta</p>
            <h3 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${promedioVentaMes.toFixed(2)}</h3>
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
                {(() => {
                  const facturasSri = sales.filter(s => !s.isNotaVenta && (s.estadoSri || s.status) !== 'NOTA_DE_VENTA');
                  if (facturasSri.length === 0) {
                    return (
                      <tr>
                        <td colSpan="15" style={{ textAlign: 'center', color: '#f87171', padding: '3rem', fontWeight: 'bold', fontSize: '1.1rem' }}>
                          No existen facturas electrónicas emitidas.
                        </td>
                      </tr>
                    );
                  }
                  
                  return facturasSri.sort((a, b) => {
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
                        <td>{issuer.puntoEmision || issuer.ptoEmi || '001'}</td>
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
                                onClick={() => window.open(`/api/sri/pdf?claveAcceso=${sale.claveAcceso || sale.id}`, '_blank')}
                                style={{ background: '#10b981', border: 'none', padding: '4px 6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                                title="Descargar RIDE PDF SRI"
                              >
                                <FileText size={14} />
                              </button>
                              <button 
                                onClick={() => window.open(`/api/sri/xml?claveAcceso=${sale.claveAcceso || sale.id}`, '_blank')}
                                style={{ background: '#ef4444', border: 'none', padding: '4px 6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                                title="Descargar XML"
                              >
                                <FileCode2 size={14} />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
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
                      <td>{issuer.puntoEmision || issuer.ptoEmi || '001'}</td>
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

      {activeTab === 'notas_venta' && (
        <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #f59e0b', paddingBottom: '10px' }}>
            <h3 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.3rem' }}>
              🧾 Historial de Notas de Venta Internas
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Documentos de control interno (Exentos de envío al SRI)
            </span>
          </div>

          {/* Filtros de Notas de Venta */}
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Buscar por Fecha:</label>
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Buscar por Cliente:</label>
              <input type="text" placeholder="Nombre de cliente..." value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Buscar por Número NV:</label>
              <input type="text" placeholder="NV-001-..." value={filterInvoice} onChange={(e) => setFilterInvoice(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={() => { setFilterDate(''); setFilterClient(''); setFilterInvoice(''); }} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Limpiar Filtros</button>
            </div>
          </div>

          {/* Tabla de Notas de Venta */}
          <div style={{ overflowX: 'auto' }}>
            <table className="pos-table" style={{ minWidth: '950px' }}>
              <thead>
                <tr>
                  <th>Fecha / Hora</th>
                  <th>Número NV</th>
                  <th>Emisor / Vendedor</th>
                  <th>Cliente</th>
                  <th>Detalle de Productos</th>
                  <th>Forma de Pago</th>
                  <th>Total</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sales
                  .filter(s => s.isNotaVenta || s.tipoComprobante === 'NOTA_DE_VENTA' || s.estadoSri === 'NOTA_DE_VENTA')
                  .filter(s => {
                    if (filterDate) {
                      const d = parseSaleDate(s);
                      if (!d || d.toISOString().split('T')[0] !== filterDate) return false;
                    }
                    if (filterClient) {
                      const cName = ((s.cliente || s.customer)?.nombre || '').toLowerCase();
                      if (!cName.includes(filterClient.toLowerCase())) return false;
                    }
                    if (filterInvoice) {
                      const num = (s.numeroComprobante || s.id || '').toLowerCase();
                      if (!num.includes(filterInvoice.toLowerCase())) return false;
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    const dateA = parseSaleDate(a);
                    const dateB = parseSaleDate(b);
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateB - dateA;
                  })
                  .map((sale, idx) => {
                    const saleDate = parseSaleDate(sale);
                    const items = sale.productos || sale.items || [];
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' }}>
                        <td style={{ whiteSpace: 'nowrap' }}>{saleDate ? saleDate.toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'}</td>
                        <td>
                          <span style={{ background: '#f59e0b', color: 'black', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {sale.numeroComprobante || sale.id}
                          </span>
                        </td>
                        <td>{resolveEmitterShortName(sale) || 'GRAVITY DENIM'}</td>
                        <td>{(sale.cliente || sale.customer)?.nombre || 'Consumidor Final'}</td>
                        <td style={{ minWidth: '220px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {items.map((p, i) => (
                              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: 'var(--text-main)' }}><b>{p.qty || p.cantidad || 1}x</b> {p.name || p.nombre}</span>
                                <span style={{ color: 'var(--text-muted)' }}>${((p.price || p.precio || 0) * (p.qty || p.cantidad || 1)).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span style={{ 
                            display: 'inline-block',
                            background: sale.paymentMethod === 'TRANSFERENCIA' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: sale.paymentMethod === 'TRANSFERENCIA' ? '#60a5fa' : '#34d399',
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold'
                          }}>
                            {sale.paymentMethod || 'EFECTIVO'} {sale.transferRecipient ? `(${sale.transferRecipient})` : ''}
                          </span>
                        </td>
                        <td style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '1.1rem' }}>
                          ${(sale.totals?.total || sale.total || 0).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', position: 'relative' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button 
                              onClick={() => setSelectedVenta(sale)}
                              style={{ padding: '6px 10px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                            >
                              🔍 Detalle
                            </button>
                            <button 
                              onClick={() => handleReimprimirClick(sale)}
                              style={{ padding: '6px 10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                            >
                              🖨️ Reimprimir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
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
      </>
      ) : mainTab === 'contadora' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header Resumen Tributario por Rango de Fechas */}
          <div className="glass-panel" style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.75) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ background: '#10b981', color: '#042f2e', fontSize: '0.68rem', fontWeight: '900', letterSpacing: '0.08em', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    REPORTE TRIBUTARIO DE VENTAS · SRI ECUADOR
                  </span>
                </div>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.6rem', color: 'white', fontWeight: 'bold' }}>
                  <FileText size={28} color="#34d399" /> Resumen para Contadora
                </h2>
                <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                  Módulo de consulta tributaria por rango de fechas. Consolida información por emisor o global.
                </p>
              </div>

              {/* Botones de Acción Destacados: Exportar PDF y Excel */}
              <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                <button
                  onClick={exportContadoraPDF}
                  style={{
                    padding: '0.75rem 1.4rem',
                    borderRadius: '8px',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Printer size={18} /> Exportar PDF
                </button>
                <button
                  onClick={exportContadoraXLSX}
                  style={{
                    padding: '0.75rem 1.4rem',
                    borderRadius: '8px',
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(16,185,129,0.4)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <FileSpreadsheet size={18} /> Exportar Excel (.xlsx)
                </button>
              </div>
            </div>
          </div>

          {/* Panel de Controles de Rango de Fechas (Fecha Desde, Fecha Hasta, Aplicar, Limpiar) */}
          <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', color: '#34d399', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  📅 Fecha Desde
                </label>
                <input
                  type="date"
                  value={contadoraStartDate}
                  onChange={e => setContadoraStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', color: '#34d399', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  📅 Fecha Hasta
                </label>
                <input
                  type="date"
                  value={contadoraEndDate}
                  onChange={e => setContadoraEndDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleApplyRange}
                  className="btn-success"
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '0.9rem'
                  }}
                >
                  <Filter size={16} /> Aplicar Rango
                </button>
                <button
                  type="button"
                  onClick={handleResetRange}
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '0.9rem'
                  }}
                >
                  <RotateCcw size={16} /> Limpiar
                </button>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800', display: 'block', marginBottom: '4px' }}>
                  Período Aplicado
                </span>
                <div style={{ padding: '0.6rem 0.85rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontWeight: 'bold', fontSize: '0.88rem', textAlign: 'center' }}>
                  {contadoraData.periodStr}
                </div>
              </div>

            </div>

            {/* Accesos Rápidos de Período */}
            <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' }}>
                Acceso rápido:
              </span>
              {[
                { label: '📆 Hoy', fn: handlePresetHoy },
                { label: '📅 Esta semana', fn: handlePresetEstaSemana },
                { label: '🗓️ Esta quincena', fn: handlePresetEstaQuincena },
                { label: '📋 Este mes', fn: handlePresetEsteMes },
              ].map(({ label, fn }) => (
                <button
                  key={label}
                  type="button"
                  onClick={fn}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '20px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#34d399',
                    fontWeight: '700',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    letterSpacing: '0.02em'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(16,185,129,0.28)';
                    e.currentTarget.style.borderColor = '#10b981';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(16,185,129,0.12)';
                    e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)';
                    e.currentTarget.style.color = '#34d399';
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid con las 10 Tarjetas de Indicadores Requeridas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            
            {/* 1. Total Vendido */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #10b981', background: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,23,42,0.85) 100%)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#34d399', fontWeight: '900', letterSpacing: '0.05em' }}>
                Total Vendido
              </span>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.8rem', color: 'white', fontWeight: '900' }}>
                ${contadoraData.totals.totalVentas.toFixed(2)}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 'bold' }}>Monto bruto total del período</span>
            </div>

            {/* 2. Subtotal Gravado 15% */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #34d399', background: 'rgba(15,23,42,0.6)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.05em' }}>
                Subtotal Gravado 15%
              </span>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: '#34d399', fontWeight: '800' }}>
                ${contadoraData.totals.subtotal15.toFixed(2)}
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Base imponible tarifa 15%</span>
            </div>

            {/* 3. Subtotal Tarifa 0% */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #fbbf24', background: 'rgba(15,23,42,0.6)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.05em' }}>
                Subtotal Tarifa 0%
              </span>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: '#fbbf24', fontWeight: '800' }}>
                ${contadoraData.totals.subtotal0.toFixed(2)}
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Base tarifa 0%</span>
            </div>

            {/* 4. IVA 15% */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #3b82f6', background: 'rgba(15,23,42,0.6)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.05em' }}>
                IVA 15%
              </span>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: '#60a5fa', fontWeight: '800' }}>
                ${contadoraData.totals.iva15.toFixed(2)}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#60a5fa' }}>Monto total impuesto recaudado</span>
            </div>

            {/* 5. Cantidad de Facturas */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #60a5fa', background: 'rgba(15,23,42,0.6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800' }}>
                  Cant. Facturas
                </span>
                <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: '0.68rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>SRI</span>
              </div>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: 'white', fontWeight: '800' }}>
                {contadoraData.totals.numFacturas}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#60a5fa' }}>Facturas electrónicas válidas</span>
            </div>

            {/* 6. Cantidad de Notas de Venta */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #c084fc', background: 'rgba(15,23,42,0.6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800' }}>
                  Cant. Notas Venta
                </span>
                <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontSize: '0.68rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>Interna</span>
              </div>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: 'white', fontWeight: '800' }}>
                {contadoraData.totals.numNotasVenta}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#c084fc' }}>Notas de venta válidas</span>
            </div>

            {/* 7. Cantidad de Comprobantes Anulados (ESTRICTAMENTE ANULADOS) */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #ef4444', background: 'rgba(15,23,42,0.6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800' }}>
                  Cant. Anulados
                </span>
                <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '0.68rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>Exclusivo</span>
              </div>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: '#f87171', fontWeight: '800' }}>
                {contadoraData.totals.numAnulados}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#f87171' }}>Solo estado ANULADO</span>
            </div>

            {/* 8. Total Efectivo */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #22c55e', background: 'rgba(15,23,42,0.6)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800' }}>
                Total Efectivo
              </span>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: '#4ade80', fontWeight: '800' }}>
                ${contadoraData.totals.totalEfectivo.toFixed(2)}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>Recaudación en efectivo</span>
            </div>

            {/* 9. Total Transferencias */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #06b6d4', background: 'rgba(15,23,42,0.6)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800' }}>
                Total Transferencias
              </span>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: '#22d3ee', fontWeight: '800' }}>
                ${contadoraData.totals.totalTransferencias.toFixed(2)}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#22d3ee' }}>Recaudación en transferencia</span>
            </div>

            {/* 10. Total Pagos Mixtos */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '5px solid #a855f7', background: 'rgba(15,23,42,0.6)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800' }}>
                Total Pagos Mixtos
              </span>
              <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.7rem', color: '#c084fc', fontWeight: '800' }}>
                ${contadoraData.totals.totalPagosMixtos.toFixed(2)}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#c084fc' }}>Ventas con método mixto</span>
            </div>

          </div>

          {/* Barra de Filtros Complementarios (Emisor, Forma de Pago, Tipo Doc, Estado, Búsqueda de Cliente y Producto) */}
          <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'end' }}>
              
              {/* Selector de Emisor / RUC */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: '#34d399', marginBottom: '6px' }}>
                  🏢 Emisor (RUC)
                </label>
                <select
                  value={contadoraIssuerId}
                  onChange={e => setContadoraIssuerId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid #10b981',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                >
                  <option value="TODOS" style={{ background: '#0f172a' }}>🌐 TODOS LOS EMISORES</option>
                  {(issuers || []).map(issuer => (
                    <option key={issuer.id} value={issuer.id} style={{ background: '#0f172a' }}>
                      {issuer.shortName || issuer.name || issuer.razonSocial} - RUC: {issuer.ruc || 'S/N'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Forma de Pago */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: '#94a3b8', marginBottom: '6px' }}>
                  💳 Forma de Pago
                </label>
                <select
                  value={contadoraPaymentFilter}
                  onChange={e => setContadoraPaymentFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                >
                  <option value="Todos" style={{ background: '#0f172a' }}>Todas las formas</option>
                  <option value="EFECTIVO" style={{ background: '#0f172a' }}>Efectivo</option>
                  <option value="TRANSFERENCIA" style={{ background: '#0f172a' }}>Transferencia</option>
                  <option value="MIXTO" style={{ background: '#0f172a' }}>Pago Mixto</option>
                </select>
              </div>

              {/* Filtro Tipo de Comprobante */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: '#94a3b8', marginBottom: '6px' }}>
                  📄 Tipo Comprobante
                </label>
                <select
                  value={contadoraDocTypeFilter}
                  onChange={e => setContadoraDocTypeFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                >
                  <option value="Todos" style={{ background: '#0f172a' }}>Todos los tipos</option>
                  <option value="Factura" style={{ background: '#0f172a' }}>Facturas</option>
                  <option value="Nota de venta" style={{ background: '#0f172a' }}>Notas de venta</option>
                </select>
              </div>

              {/* Filtro Estado del Comprobante */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: '#94a3b8', marginBottom: '6px' }}>
                  🔍 Estado Comprobante
                </label>
                <select
                  value={contadoraStatusFilter}
                  onChange={e => setContadoraStatusFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                >
                  <option value="Todos" style={{ background: '#0f172a' }}>Todos los estados</option>
                  <option value="Valida" style={{ background: '#0f172a' }}>Válidas / Autorizadas</option>
                  <option value="Anulada" style={{ background: '#0f172a' }}>Anuladas</option>
                </select>
              </div>

              {/* Filtro por Cliente */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: '#94a3b8', marginBottom: '6px' }}>
                  👤 Buscar Cliente / RUC
                </label>
                <input
                  type="text"
                  placeholder="Cliente o RUC..."
                  value={contadoraSearchText}
                  onChange={e => setContadoraSearchText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Filtro por Producto */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: '#94a3b8', marginBottom: '6px' }}>
                  📦 Buscar Producto / SKU
                </label>
                <input
                  type="text"
                  placeholder="Prenda o SKU..."
                  value={contadoraProductSearchText}
                  onChange={e => setContadoraProductSearchText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
              </div>

            </div>
          </div>

          {/* Tabla Detallada de Comprobantes del Período */}
          <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h4 style={{ margin: 0, color: 'white', fontSize: '1.15rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📋 Detalle de Comprobantes del Período Seleccionado
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Mostrando {contadoraData.filteredVouchers.length} de {contadoraData.allVouchers.length} comprobantes en el período
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.12)', textAlign: 'left', color: '#94a3b8', background: 'rgba(0,0,0,0.2)' }}>
                    <th style={{ padding: '12px 10px' }}>Fecha</th>
                    <th style={{ padding: '12px 10px' }}>Tipo</th>
                    <th style={{ padding: '12px 10px' }}>No. Comprobante</th>
                    <th style={{ padding: '12px 10px' }}>Cliente</th>
                    <th style={{ padding: '12px 10px' }}>RUC / Cédula</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Base 15%</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Base 0%</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>IVA 15%</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Forma Pago</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Estado</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {contadoraData.filteredVouchers.map((v, i) => {
                    const isAnul = v.isAnulado;
                    const saleKey = v.rawSale?.claveAcceso || v.rawSale?.claveAccesoOriginal || v.id;
                    return (
                      <tr
                        key={v.id || i}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: isAnul ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                          opacity: isAnul ? 0.75 : 1
                        }}
                      >
                        <td style={{ padding: '12px 10px', color: '#cbd5e1' }}>{v.fecha}</td>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold' }}>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            background: v.docType === 'Factura' ? 'rgba(59,130,246,0.18)' : 'rgba(168,85,247,0.18)',
                            color: v.docType === 'Factura' ? '#60a5fa' : '#c084fc',
                            border: v.docType === 'Factura' ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(168,85,247,0.3)'
                          }}>
                            {v.docType}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px', fontFamily: 'monospace', fontWeight: 'bold', color: 'white' }}>
                          {v.numeroComprobante}
                        </td>
                        <td style={{ padding: '12px 10px', color: 'white', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.clienteNombre}
                        </td>
                        <td style={{ padding: '12px 10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {v.clienteRuc}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: isAnul ? '#ef4444' : 'var(--text-main)' }}>
                          ${isAnul ? '0.00' : v.vSubtotal15.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: isAnul ? '#ef4444' : 'var(--text-main)' }}>
                          ${isAnul ? '0.00' : v.vSubtotal0.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: isAnul ? '#ef4444' : '#60a5fa', fontWeight: 'bold' }}>
                          ${isAnul ? '0.00' : v.iva.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: isAnul ? '#ef4444' : '#34d399', fontSize: '0.9rem' }}>
                          ${isAnul ? '0.00' : v.total.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', fontWeight: 'bold' }}>
                            {v.pMethod}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          {isAnul ? (
                            <span style={{ color: '#f87171', fontWeight: 'bold', fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(239,68,68,0.2)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)' }}>
                              Anulada
                            </span>
                          ) : (
                            <span style={{ color: '#34d399', fontWeight: 'bold', fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(16,185,129,0.2)', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.3)' }}>
                              Válida
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => window.open(`/api/sri/pdf?claveAcceso=${saleKey}`, '_blank')}
                              title="Ver RIDE PDF"
                              style={{ padding: '4px 8px', borderRadius: '6px', background: '#2563eb', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              PDF
                            </button>
                            {v.docType === 'Factura' && (
                              <button
                                onClick={() => window.open(`/api/sri/xml?claveAcceso=${saleKey}`, '_blank')}
                                title="Descargar XML SRI"
                                style={{ padding: '4px 8px', borderRadius: '6px', background: '#059669', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                              >
                                XML
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {contadoraData.filteredVouchers.length === 0 && (
                    <tr>
                      <td colSpan="12" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                        No se encontraron comprobantes registrados para las fechas y filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
