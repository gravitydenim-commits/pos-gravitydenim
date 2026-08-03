import React, { useMemo, useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Percent, Package, Users, Activity, FileText, Download, FileType2, FileCode2, Printer, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [usersList, setUsersList] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);

  // --- VARIABLES DE ESTADO PARA CIERRE DIARIO ---
  const [mainTab, setMainTab] = useState('general'); // 'general' | 'cierre_diario'
  const [cierreDate, setCierreDate] = useState(() => {
    const d = new Date();
    // Timezone safe Ecuador (UTC-5)
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ecDate = new Date(utc + (3600000 * -5));
    return ecDate.toISOString().slice(0, 10);
  });
  
  const [cierreFilterDocType, setCierreFilterDocType] = useState('Todos'); // 'Todos' | 'Facturas' | 'Notas de venta'
  const [cierreFilterPayment, setCierreFilterPayment] = useState('Todas'); // 'Todas' | 'Efectivo' | 'Transferencia' | 'Pago mixto'
  const [cierreFilterEmitter, setCierreFilterEmitter] = useState('Todos'); // 'Todos' | 'Edgar' | 'FabiÃ¡n' | 'Amparito'
  const [cierreFilterOwner, setCierreFilterOwner] = useState('Todos'); // 'Todos' | 'Edgar' | 'FabiÃ¡n' | 'Amparito'
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
          console.warn("â ï¸ No se pudo reimprimir vÃ­a iMin, recurriendo al sistema grÃ¡fico:", iminErr);
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
      alert(`â ï¸ NO SE PUEDE REIMPRIMIR:\nEl comprobante no estÃ¡ autorizado por el SRI. Estado actual: ${estado || 'PENDIENTE'}`);
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
      `â ï¸ ANULACIÃN DE COMPROBANTE\n\n` +
      `Â¿Seguro que deseas anular esta ${docTypeStr} (ID: ${sale.id})?\n` +
      `Esta acciÃ³n no modificarÃ¡ el inventario pero cambiarÃ¡ su estado a ANULADA.`
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
      alert(`${docTypeStr} marcada como ANULADA con Ã©xito.`);
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
      alert("â ï¸ No hay ventas registradas el dÃ­a de hoy para imprimir.");
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
        alert("â Reporte diario enviado a la CRM-03.");
      } catch (err) {
        alert("Error al imprimir en 58mm: " + err.message);
      }
    } else {
      // ImpresiÃ³n de sistema (HTML) de 80mm o 58mm
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

  // Procesar datos para el mes actual y el dÃ­a de hoy
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
      "Fecha de EmisiÃ³n",
      "Tipo Comprobante",
      "RUC Emisor",
      "Emisor",
      "IdentificaciÃ³n Cliente",
      "Nombre Cliente",
      "Email Cliente",
      "TelÃ©fono Cliente",
      "DirecciÃ³n Cliente",
      "Base Imponible 15%",
      "Base Imponible 0%",
      "Monto IVA 15%",
      "Valor Total",
      "Clave de Acceso",
      "MÃ©todo de Pago",
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

    // 3. Unir cabeceras y filas con salto de lÃ­nea
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
  // --- INICIO DE LÃGICA DE CIERRE DIARIO ---
  // =========================================================================

  const getShortName = (name) => {
    if (!name) return 'Desconocido';
    const n = name.toLowerCase();
    if (n.includes('fabian') || n.includes('fabiÃ¡n')) return 'FabiÃ¡n';
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
    
    const brothers = ['Edgar', 'FabiÃ¡n', 'Amparito'];
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
  // --- FIN DE LÃGICA DE CIERRE DIARIO ---
  // =========================================================================

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
      {/* PestaÃ±as de Cierre Diario vs Reporte General */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', marginBottom: '2rem', gap: '1rem' }}>
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
          <BarChart3 size={20} /> Reporte general
        </button>
        <button
          onClick={() => setMainTab('cierre_diario')}
          style={{
            padding: '1rem 2rem',
            background: 'transparent',
            border: 'none',
            borderBottom: mainTab === 'cierre_diario' ? '3px solid var(--accent)' : '3px solid transparent',
            color: mainTab === 'cierre_diario' ? 'white' : 'var(--text-muted)',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Calendar size={20} /> Cierre diario
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
            <Printer size={16} /> Imprimir Cierre del DÃ­a
          </button>
          <button 
            onClick={() => setActiveTab('sri')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'sri' ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ð Reporte General de Ventas
          </button>
          <button 
            onClick={() => setActiveTab('notas_venta')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'notas_venta' ? '#f59e0b' : 'transparent', border: '1px solid #f59e0b', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ð§¾ Historial de Notas de Venta
          </button>
          <button 
            onClick={() => setActiveTab('cierre_hermano')}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: activeTab === 'cierre_hermano' ? '#6366f1' : 'transparent', border: '1px solid #6366f1', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ð¥ Cierre por Hermano
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
                          No existen facturas electrÃ³nicas emitidas.
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
              ð§¾ Historial de Notas de Venta Internas
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Documentos de control interno (Exentos de envÃ­o al SRI)
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
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Buscar por NÃºmero NV:</label>
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
                  <th>NÃºmero NV</th>
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
                              ð Detalle
                            </button>
                            <button 
                              onClick={() => handleReimprimirClick(sale)}
                              style={{ padding: '6px 10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                            >
                              ð¨ï¸ Reimprimir
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
                 <div><b>Nombre/RazÃ³n Social:</b> {selectedVenta.issuerName || 'GRAVITY DENIM'}</div>
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
                     <th style={{ padding: '6px' }}>DescripciÃ³n</th>
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
               <div><b>NÃºmero AutorizaciÃ³n:</b> {selectedVenta.numeroAutorizacion || 'N/A'}</div>
               <div><b>Fecha AutorizaciÃ³n:</b> {selectedVenta.fechaAutorizacion || 'N/A'}</div>
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
      ) : (
        /* Render new Cierre Diario tab */
        <div className="cierre-diario-tab animated fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* 1. SELECTOR DE FECHA */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>
                ð Cierre del dÃ­a: <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{formatECDate(cierreDate)}</span>
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button 
                onClick={handlePrevDay} 
                className="btn-primary" 
                style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="DÃ­a Anterior"
              >
                <ChevronLeft size={16} /> DÃ­a Anterior
              </button>
              <button 
                onClick={handleSetToday} 
                className="btn-success"
                style={{ padding: '0.5rem 1.2rem', fontWeight: 'bold' }}
              >
                Hoy
              </button>
              <button 
                onClick={handleNextDay} 
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="DÃ­a Siguiente"
              >
                DÃ­a Siguiente <ChevronRight size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fecha:</span>
                <input 
                  type="date" 
                  value={cierreDate} 
                  onChange={e => setCierreDate(e.target.value)} 
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '6px',
                    color: 'white',
                    padding: '0.4rem 0.6rem',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                />
              </div>
            </div>
          </div>

          {/* 2. TARJETAS KPI RESUMEN */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid var(--success)' }}>
              <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.15)', borderRadius: '50%', color: '#22c55e' }}>
                <DollarSign size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Vendido</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${closureTotals.totalVendido.toFixed(2)}</h3>
              </div>
            </div>
            
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '50%', color: '#3b82f6' }}>
                <DollarSign size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Efectivo</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${closureTotals.totalEfectivo.toFixed(2)}</h3>
              </div>
            </div>
            
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #a855f7' }}>
              <div style={{ padding: '12px', background: 'rgba(168, 85, 247, 0.15)', borderRadius: '50%', color: '#a855f7' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Transferencia</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${closureTotals.totalTransferencia.toFixed(2)}</h3>
              </div>
            </div>
            
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '50%', color: '#f59e0b' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>Pagos Mixtos</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${closureTotals.totalPagosMixtos.toFixed(2)}</h3>
              </div>
            </div>
            
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #ec4899' }}>
              <div style={{ padding: '12px', background: 'rgba(236, 72, 153, 0.15)', borderRadius: '50%', color: '#ec4899' }}>
                <FileText size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>Facturas / Notas</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>
                  F: ${closureTotals.totalFacturas.toFixed(2)} | N: ${closureTotals.totalNotasVenta.toFixed(2)}
                </h3>
              </div>
            </div>
            
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #14b8a6' }}>
              <div style={{ padding: '12px', background: 'rgba(20, 184, 166, 0.15)', borderRadius: '50%', color: '#14b8a6' }}>
                <Percent size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>IVA Generado (15%)</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>${closureTotals.totalIva.toFixed(2)}</h3>
              </div>
            </div>
            
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #6366f1' }}>
              <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '50%', color: '#6366f1' }}>
                <Users size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>Ventas Ãnicas</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>{closureTotals.numVentas} transacciones</h3>
              </div>
            </div>
            
            <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #06b6d4' }}>
              <div style={{ padding: '12px', background: 'rgba(6, 182, 212, 0.15)', borderRadius: '50%', color: '#06b6d4' }}>
                <Package size={24} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 0.2rem 0', textTransform: 'uppercase', fontWeight: 'bold' }}>Prendas Vendidas</p>
                <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 'bold', color: 'white' }}>{closureTotals.totalPrendas} unidades</h3>
              </div>
            </div>
          </div>

          {/* 3. SECCIÃN DE FILTROS */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={18} color="var(--accent)" /> Filtros de Cierre Diario
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {/* Tipo de Documento */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tipo de Documento:</label>
                <select 
                  value={cierreFilterDocType} 
                  onChange={e => setCierreFilterDocType(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  <option value="Todos">Todos</option>
                  <option value="Facturas">Facturas</option>
                  <option value="Notas de venta">Notas de venta</option>
                </select>
              </div>

              {/* Forma de Pago */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Forma de Pago:</label>
                <select 
                  value={cierreFilterPayment} 
                  onChange={e => setCierreFilterPayment(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  <option value="Todas">Todas</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Pago mixto">Pago mixto</option>
                </select>
              </div>

              {/* Emisor / Cajero */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Emisor / Cajero:</label>
                <select 
                  value={cierreFilterEmitter} 
                  onChange={e => setCierreFilterEmitter(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  <option value="Todos">Todos</option>
                  <option value="Edgar">Edgar</option>
                  <option value="FabiÃ¡n">FabiÃ¡n</option>
                  <option value="Amparito">Amparito</option>
                </select>
              </div>

              {/* Propietario del Producto */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Propietario del Producto:</label>
                <select 
                  value={cierreFilterOwner} 
                  onChange={e => setCierreFilterOwner(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  <option value="Todos">Todos</option>
                  <option value="Edgar">Edgar</option>
                  <option value="FabiÃ¡n">FabiÃ¡n</option>
                  <option value="Amparito">Amparito</option>
                </select>
              </div>

              {/* BÃºsqueda Cliente */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cliente (Nombre/CI/RUC):</label>
                <input 
                  type="text" 
                  placeholder="Buscar cliente..." 
                  value={cierreFilterClientText} 
                  onChange={e => setCierreFilterClientText(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', padding: '0.5rem', fontSize: '0.85rem' }}
                />
              </div>

              {/* BÃºsqueda Producto */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Producto (Nombre/CÃ³digo/Cat):</label>
                <input 
                  type="text" 
                  placeholder="Buscar producto..." 
                  value={cierreFilterProductText} 
                  onChange={e => setCierreFilterProductText(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', padding: '0.5rem', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
              <button 
                onClick={handleClearCierreFilters} 
                className="btn-danger" 
                style={{ padding: '0.5rem 1.5rem', fontWeight: 'bold' }}
              >
                Limpiar Filtros
              </button>
            </div>
          </div>

          {/* 4. AGRUPACIÃN Y ACCIONES */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Agrupar ventas por:</span>
              <select 
                value={cierreGrouping} 
                onChange={e => setCierreGrouping(e.target.value)}
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', padding: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold' }}
              >
                <option value="Sin agrupar">Sin agrupar</option>
                <option value="Hermano">Hermano (Propietario)</option>
                <option value="Forma de pago">Forma de pago</option>
                <option value="Producto">Producto</option>
                <option value="Tipo de documento">Tipo de documento</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              {/* Opciones de Impresión */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Formato imp:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'white', cursor: 'pointer' }}>
                  <input type="radio" name="printOption" value="detalle" checked={printOption === 'detalle'} onChange={() => setPrintOption('detalle')} />
                  Detalle
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'white', cursor: 'pointer' }}>
                  <input type="radio" name="printOption" value="resumen" checked={printOption === 'resumen'} onChange={() => setPrintOption('resumen')} />
                  Resumen
                </label>
              </div>

              {/* Formato de Papel */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Papel:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'white', cursor: 'pointer' }}>
                  <input type="radio" name="cierrePaperFormat" value="80mm" checked={cierrePaperFormat === '80mm'} onChange={() => setCierrePaperFormat('80mm')} />
                  80 mm (Térmico)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'white', cursor: 'pointer' }}>
                  <input type="radio" name="cierrePaperFormat" value="normal" checked={cierrePaperFormat === 'normal'} onChange={() => setCierrePaperFormat('normal')} />
                  Normal (A4)
                </label>
              </div>

              <button 
                onClick={() => handlePrintCierre(printOption)}
                className="btn-success" 
                style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                <Printer size={16} /> Imprimir Cierre
              </button>

              <button 
                onClick={exportCierreCSV}
                className="btn-primary" 
                style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', background: '#10b981', borderColor: '#10b981' }}
              >
                <Download size={16} /> Exportar Excel
              </button>

              <button 
                onClick={() => handlePrintCierre(printOption)}
                className="btn-primary" 
                style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                <Download size={16} /> Exportar PDF
              </button>
            </div>
          </div>

          {/* 5. TABLA DE DATOS */}
          <div className="glass-panel" style={{ padding: 0, border: '1px solid var(--panel-border)', overflowX: 'auto' }}>
            {cierreGrouping === 'Sin agrupar' ? (
              <table className="pos-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                    <th>Hora</th>
                    <th>Documento</th>
                    <th>N.Âº Documento</th>
                    <th>Cliente</th>
                    <th>IdentificaciÃ³n</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th style={{ textAlign: 'right' }}>V. Unitario</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                    <th style={{ textAlign: 'right' }}>IVA</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Forma de Pago</th>
                    <th>Propietario (Owner)</th>
                    <th>Emisor (Caja)</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItemRows.length === 0 ? (
                    <tr>
                      <td colSpan="15" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No hay ventas registradas para este dÃ­a con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredItemRows.map(row => (
                      <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'white' }}>
                        <td>{row.time}</td>
                        <td>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 'bold',
                            background: row.docType === 'Factura' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: row.docType === 'Factura' ? '#22c55e' : '#f59e0b',
                            border: `1px solid ${row.docType === 'Factura' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                          }}>
                            {row.docType.toUpperCase()}
                          </span>
                        </td>
                        <td>{row.docNo}</td>
                        <td>{row.clientName}</td>
                        <td>{row.clientId}</td>
                        <td style={{ fontWeight: 'bold' }}>{row.productName}</td>
                        <td>{row.qty}</td>
                        <td style={{ textAlign: 'right' }}>${row.unitPrice.toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }}>${row.subtotal.toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }}>${row.iva.toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${row.total.toFixed(2)}</td>
                        <td>
                          {row.isMixed ? (
                            <span style={{ color: '#60a5fa' }}>ð MIXTO (Ef: ${row.allocatedCash.toFixed(2)} | Tr: ${row.allocatedTransfer.toFixed(2)})</span>
                          ) : (
                            <span>{row.paymentMethod}</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{row.owner}</td>
                        <td>{row.emitterShort}</td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: row.estado === 'ANULADA' ? '#ef4444' : '#22c55e',
                            fontWeight: 'bold',
                            fontSize: '0.8rem'
                          }}>
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: row.estado === 'ANULADA' ? '#ef4444' : '#22c55e'
                            }}></span>
                            {row.estado}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              /* TABLA AGRUPADA */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1rem' }}>
                {groupedSections.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No hay ventas registradas para este dÃ­a.
                  </div>
                ) : (
                  groupedSections.map(group => (
                    <div key={group.key} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>
                          ð Grupo: <span style={{ color: 'var(--accent)' }}>{group.key.toUpperCase()}</span>
                        </span>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          <span>Total Vendido: <strong style={{ color: 'white' }}>${group.totalVendido.toFixed(2)}</strong></span>
                          <span>Efectivo: <strong style={{ color: 'white' }}>${group.totalEfectivo.toFixed(2)}</strong></span>
                          <span>Transferencia: <strong style={{ color: 'white' }}>${group.totalTransferencia.toFixed(2)}</strong></span>
                          <span>Prendas: <strong style={{ color: 'white' }}>{group.totalPrendas} u.</strong></span>
                          <span>Ventas: <strong style={{ color: 'white' }}>{group.numVentas}</strong></span>
                        </div>
                      </div>
                      
                      <div style={{ overflowX: 'auto' }}>
                        <table className="pos-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                              <th>Hora</th>
                              <th>Documento</th>
                              <th>N.Âº Documento</th>
                              <th>Cliente</th>
                              <th>IdentificaciÃ³n</th>
                              <th>Producto</th>
                              <th>Cantidad</th>
                              <th style={{ textAlign: 'right' }}>V. Unitario</th>
                              <th style={{ textAlign: 'right' }}>Subtotal</th>
                              <th style={{ textAlign: 'right' }}>IVA</th>
                              <th style={{ textAlign: 'right' }}>Total</th>
                              <th>Forma de Pago</th>
                              <th>Propietario (Owner)</th>
                              <th>Emisor (Caja)</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map(row => (
                              <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'white' }}>
                                <td>{row.time}</td>
                                <td>
                                  <span style={{
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.72rem',
                                    fontWeight: 'bold',
                                    background: row.docType === 'Factura' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                    color: row.docType === 'Factura' ? '#22c55e' : '#f59e0b',
                                    border: `1px solid ${row.docType === 'Factura' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                  }}>
                                    {row.docType.toUpperCase()}
                                  </span>
                                </td>
                                <td>{row.docNo}</td>
                                <td>{row.clientName}</td>
                                <td>{row.clientId}</td>
                                <td style={{ fontWeight: 'bold' }}>{row.productName}</td>
                                <td>{row.qty}</td>
                                <td style={{ textAlign: 'right' }}>${row.unitPrice.toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>${row.subtotal.toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>${row.iva.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${row.total.toFixed(2)}</td>
                                <td>
                                  {row.isMixed ? (
                                    <span style={{ color: '#60a5fa' }}>ð MIXTO (Ef: ${row.allocatedCash.toFixed(2)} | Tr: ${row.allocatedTransfer.toFixed(2)})</span>
                                  ) : (
                                    <span>{row.paymentMethod}</span>
                                  )}
                                </td>
                                <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{row.owner}</td>
                                <td>{row.emitterShort}</td>
                                <td>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: row.estado === 'ANULADA' ? '#ef4444' : '#22c55e',
                                    fontWeight: 'bold',
                                    fontSize: '0.8rem'
                                  }}>
                                    <span style={{
                                      width: '6px',
                                      height: '6px',
                                      borderRadius: '50%',
                                      background: row.estado === 'ANULADA' ? '#ef4444' : '#22c55e'
                                    }}></span>
                                    {row.estado}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
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
      { id: 'Fabian', name: 'Fabian (Domingo SÃ¡nchez)', dbKeys: ['domingo', 'fabian', 'junior', 'sanchez'] },
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

  // CÃ¡lculos de compensaciÃ³n y desglose para el hermano seleccionado o general
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
          productos: items.map(i => `${i.qty || 1}x ${i.name || i.nombre} (${i.ownerName || 'Sin DueÃ±o'})`).join(', '),
          montoTotal: proportionVal
        });

        // Calcular compensaciÃ³n general entre hermanos
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
      
      // ProporciÃ³n (incluyendo IVA proporcional)
      const proportion = siblingItemsVal / totalItemsVal;
      const proportionVal = proportion * (sale.totals?.total || sale.total || 0);

      // Si el hermano seleccionado es dueÃ±o de algo en esta venta
      if (siblingItemsVal > 0) {
        ventasPropiasTotal += proportionVal;
        ventasPropiasCantidad += siblingItems.reduce((acc, i) => acc + (i.qty || 1), 0);

        // Desglosar por mÃ©todo de pago
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
            // Buscar cuÃ¡l de los otros hermanos recibiÃ³ la transferencia
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
        // Si el hermano seleccionado recibiÃ³ esta transferencia
        const receivedByUs = t.recipientId ? (t.recipientId === selectedProfile.firebaseId) : (t.recipientName && t.recipientName.toLowerCase().includes(selectedProfile.id.toLowerCase()));
        if (receivedByUs) {
          // Analizar a quiÃ©n pertenecen los productos de esta transferencia
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
        ð Cierre Diario por Hermano y Compensaciones
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
          ð¡ Selecciona un hermano de la lista para ver su balance de cierre diario.
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
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 5px 0' }}>ProporciÃ³n Efectivo</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0 }}>${siblingData.ventasPropiasEfectivo.toFixed(2)}</h3>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '4px solid #3b82f6' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 5px 0' }}>ProporciÃ³n Transferencias</p>
              <h3 style={{ fontSize: '1.8rem', margin: 0, color: '#3b82f6' }}>${siblingData.ventasPropiasTransferencias.toFixed(2)}</h3>
            </div>
          </div>

          {/* SecciÃ³n 1: Detalle de Ventas Propias */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ color: '#60a5fa', margin: '0 0 1rem 0' }}>ð¦ Detalle de prendas vendidas pertenecientes a {siblingData.siblingName}</h4>
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

          {/* SecciÃ³n 2: Transferencias recibidas en su cuenta (De otros hermanos) */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ color: '#a78bfa', margin: '0 0 1rem 0' }}>ð¦ Transferencias recibidas en cuenta de {siblingData.siblingName} por productos de otros</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>No. Venta</th>
                    <th style={{ padding: '8px' }}>Cliente</th>
                    <th style={{ padding: '8px' }}>DueÃ±o del Producto</th>
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

          {/* SecciÃ³n 3: Transferencias propias en cuentas de otros hermanos */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ color: '#f59e0b', margin: '0 0 1rem 0' }}>ð Transferencias de productos de {siblingData.siblingName} recibidas en cuentas de otros</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>No. Venta</th>
                    <th style={{ padding: '8px' }}>Cliente</th>
                    <th style={{ padding: '8px' }}>QuiÃ©n recibiÃ³ la transferencia</th>
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

          {/* SecciÃ³n 4: Tabla Resumen de Compensaciones */}
          <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ color: 'var(--success)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              âï¸ Matriz de Compensaciones para {siblingData.siblingName}
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


