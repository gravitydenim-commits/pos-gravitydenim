import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase/config';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  doc, 
  runTransaction 
} from 'firebase/firestore';
import { 
  Search, 
  CreditCard, 
  DollarSign, 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  User, 
  Receipt, 
  X, 
  Loader2, 
  History, 
  ArrowRight,
  Filter,
  PlusCircle
} from 'lucide-react';

const formatCurrency = (val) => {
  const num = Number(val) || 0;
  return `$${num.toFixed(2)}`;
};

const parseDateStr = (rawDate) => {
  if (!rawDate) return 'N/A';
  if (typeof rawDate?.toDate === 'function') {
    return rawDate.toDate().toLocaleDateString('es-EC');
  }
  if (rawDate?.seconds) {
    return new Date(rawDate.seconds * 1000).toLocaleDateString('es-EC');
  }
  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString('es-EC');
};

export default function CuentasPorCobrarScreen({ currentUser, issuers = [], cobrosProp, salesProp }) {
  const [sales, setSales] = useState(() => {
    if (salesProp && salesProp.length > 0) {
      return salesProp.filter(s => s.paymentMethod === 'CREDITO' || s.isCredito || s.paymentDetails?.creditAmount > 0);
    }
    return [];
  });
  const [cobros, setCobros] = useState(cobrosProp || []);
  const [loading, setLoading] = useState(!salesProp || salesProp.length === 0);

  // Estados de Filtro
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDIENTES'); // 'PENDIENTES' | 'PAGADAS' | 'TODAS'
  const [issuerFilter, setIssuerFilter] = useState('TODOS');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modales
  const [selectedAccount, setSelectedAccount] = useState(null); // Para modal de cobro
  const [historyAccount, setHistoryAccount] = useState(null); // Para modal de historial
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Estado del formulario de cobro
  const [montoCobro, setMontoCobro] = useState('');
  const [formaPago, setFormaPago] = useState('EFECTIVO');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacion, setObservacion] = useState('');
  const [transferBank, setTransferBank] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('Edgar');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Escuchar ÚNICAMENTE ventas que sean a Crédito (isCredito == true)
  // Evita descargar cientos de documentos históricos de efectivo/transferencia innecesarios
  useEffect(() => {
    const qVentas = query(
      collection(db, 'ventas'), 
      where('isCredito', '==', true)
    );

    const unsubVentas = onSnapshot(qVentas, (snapshot) => {
      const docs = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter(sale => {
          const est = (sale.estadoSri || sale.status || '').toUpperCase();
          if (est === 'ERROR_DUPLICADO' || est === 'REEMPLAZADO' || est === 'ANULADA' || est === 'REVERTIDA_NC') return false;
          return true;
        })
        .sort((a, b) => {
          const dateA = a.fechaTransaccion ? new Date(a.fechaTransaccion).getTime() : 0;
          const dateB = b.fechaTransaccion ? new Date(b.fechaTransaccion).getTime() : 0;
          return dateB - dateA;
        });

      setSales(docs);
      setLoading(false);
    }, (err) => {
      console.error("Error escuchando cuentas por cobrar:", err);
      setLoading(false);
    });

    let unsubCobros;
    if (cobrosProp && cobrosProp.length >= 0) {
      setCobros(cobrosProp);
    } else {
      const qCobros = query(collection(db, 'cobros_credito'), orderBy('createdAt', 'desc'));
      unsubCobros = onSnapshot(qCobros, (snapshot) => {
        const docs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        setCobros(docs);
      }, (err) => {
        console.error("Error escuchando cobros_credito:", err);
      });
    }

    return () => {
      unsubVentas();
      if (unsubCobros) unsubCobros();
    };
  }, [cobrosProp]);

  // 2. KPIs de Resumen
  const kpis = useMemo(() => {
    let totalPendiente = 0;
    let totalCobrado = 0;
    const clientsWithDebtSet = new Set();
    let pendingCount = 0;

    sales.forEach(sale => {
      const totalVenta = sale.totals?.total || sale.total || 0;
      const creditAmt = sale.paymentDetails?.creditAmount ?? (sale.creditAmount !== undefined ? sale.creditAmount : totalVenta);
      const paidAmt = sale.paymentDetails?.totalPagadoCredito ?? (sale.totalPagadoCredito || 0);
      const pendingAmt = Math.max(0, Number((creditAmt - paidAmt).toFixed(2)));

      if (pendingAmt > 0) {
        totalPendiente += pendingAmt;
        pendingCount++;
        const clientDoc = (sale.cliente || sale.customer)?.numeroIdentificacion || (sale.cliente || sale.customer)?.nombre || 'ANONIMO';
        clientsWithDebtSet.add(clientDoc);
      }
      totalCobrado += paidAmt;
    });

    return {
      totalPendiente,
      totalCobrado,
      clientsWithDebtCount: clientsWithDebtSet.size,
      pendingCount
    };
  }, [sales]);

  // 3. Filtrado de Tabla
  const filteredAccounts = useMemo(() => {
    return sales.filter(sale => {
      const totalVenta = sale.totals?.total || sale.total || 0;
      const creditAmt = sale.paymentDetails?.creditAmount ?? (sale.creditAmount !== undefined ? sale.creditAmount : totalVenta);
      const paidAmt = sale.paymentDetails?.totalPagadoCredito ?? (sale.totalPagadoCredito || 0);
      const pendingAmt = Math.max(0, Number((creditAmt - paidAmt).toFixed(2)));

      const estadoCredito = pendingAmt === 0 ? 'PAGADA' : (paidAmt > 0 ? 'ABONADA' : 'PENDIENTE');

      // Filtro de Estado
      if (statusFilter === 'PENDIENTES' && estadoCredito === 'PAGADA') return false;
      if (statusFilter === 'PAGADAS' && estadoCredito !== 'PAGADA') return false;

      // Filtro de Emisor
      if (issuerFilter !== 'TODOS') {
        const emisorMatch = sale.emisorId === issuerFilter || sale.issuerId === issuerFilter;
        if (!emisorMatch) return false;
      }

      // Filtro de Fechas
      const rawDate = sale.fechaTransaccion || sale.fechaEmision || sale.date;
      if (rawDate) {
        const saleDateStr = new Date(rawDate).toISOString().slice(0, 10);
        if (dateFrom && saleDateStr < dateFrom) return false;
        if (dateTo && saleDateStr > dateTo) return false;
      }

      // Búsqueda de Texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const clientName = ((sale.cliente || sale.customer)?.nombre || '').toLowerCase();
        const clientDoc = ((sale.cliente || sale.customer)?.numeroIdentificacion || '').toLowerCase();
        const compNo = (sale.numeroComprobante || sale.secuencial || '').toLowerCase();
        return clientName.includes(term) || clientDoc.includes(term) || compNo.includes(term);
      }

      return true;
    });
  }, [sales, statusFilter, issuerFilter, dateFrom, dateTo, searchTerm]);

  // Abrir Modal de Cobro
  const handleOpenCobroModal = (sale) => {
    setSelectedAccount(sale);
    const totalVenta = sale.totals?.total || sale.total || 0;
    const creditAmt = sale.paymentDetails?.creditAmount ?? (sale.creditAmount !== undefined ? sale.creditAmount : totalVenta);
    const paidAmt = sale.paymentDetails?.totalPagadoCredito ?? (sale.totalPagadoCredito || 0);
    const pendingAmt = Math.max(0, Number((creditAmt - paidAmt).toFixed(2)));

    setMontoCobro(pendingAmt.toFixed(2));
    setFormaPago('EFECTIVO');
    setFechaPago(new Date().toISOString().slice(0, 10));
    setObservacion('');
    setTransferBank('');
    setTransferReference('');
    setErrorMessage('');
    setIsProcessing(false);
  };

  // Abrir Modal de Historial
  const handleOpenHistoryModal = (sale) => {
    setHistoryAccount(sale);
    setLoadingHistory(true);
    const accountCobros = cobros.filter(c => c.ventaId === sale.id);
    setHistoryList(accountCobros);
    setLoadingHistory(false);
  };

  // Ejecutar Cobro Atómico mediante Transacción Firestore
  const handleConfirmCobro = async (e) => {
    e.preventDefault();
    if (isProcessing || !selectedAccount) return;

    const numericMonto = Number(parseFloat(montoCobro).toFixed(2));
    if (isNaN(numericMonto) || numericMonto <= 0) {
      setErrorMessage("⚠️ Ingrese un monto de cobro válido mayor a $0.00");
      return;
    }

    const totalVenta = selectedAccount.totals?.total || selectedAccount.total || 0;
    const creditAmt = selectedAccount.paymentDetails?.creditAmount ?? (selectedAccount.creditAmount !== undefined ? selectedAccount.creditAmount : totalVenta);
    const paidAmtCurrent = selectedAccount.paymentDetails?.totalPagadoCredito ?? (selectedAccount.totalPagadoCredito || 0);
    const currentPending = Math.max(0, Number((creditAmt - paidAmtCurrent).toFixed(2)));

    // REGULA PARÁMETRO 2: Protección contra cobros superiores al saldo
    if (numericMonto > currentPending + 0.001) {
      setErrorMessage(`⚠️ El monto a cobrar ($${numericMonto.toFixed(2)}) no puede ser mayor al saldo pendiente ($${currentPending.toFixed(2)}).`);
      return;
    }

    // REGULA PARÁMETRO 4: Bloqueo de botón contra doble clic
    setIsProcessing(true);
    setErrorMessage('');

    try {
      // REGULA PARÁMETRO 3: Transacción atómica
      await runTransaction(db, async (transaction) => {
        const ventaRef = doc(db, 'ventas', selectedAccount.id);
        const ventaSnap = await transaction.get(ventaRef);
        
        if (!ventaSnap.exists()) {
          throw new Error("La venta seleccionada no existe en la base de datos.");
        }

        const ventaData = ventaSnap.data();
        const currentPaid = ventaData.paymentDetails?.totalPagadoCredito ?? (ventaData.totalPagadoCredito || 0);
        const totalOriginal = ventaData.totals?.total || ventaData.total || 0;
        const totalCreditoOriginal = ventaData.paymentDetails?.creditAmount ?? (ventaData.creditAmount !== undefined ? ventaData.creditAmount : totalOriginal);
        
        const newTotalPagado = Number((currentPaid + numericMonto).toFixed(2));
        const newSaldo = Math.max(0, Number((totalCreditoOriginal - newTotalPagado).toFixed(2)));

        // REGULA PARÁMETRO 5: Saldo Cero
        const newEstadoCredito = newSaldo === 0 ? 'PAGADA' : 'ABONADA';

        // Crear documento de cobro en cobros_credito
        const newCobroRef = doc(collection(db, 'cobros_credito'));
        const cobroPayload = {
          id: newCobroRef.id,
          ventaId: selectedAccount.id,
          numeroComprobante: selectedAccount.numeroComprobante || selectedAccount.secuencial || 'S/N',
          cliente: selectedAccount.cliente || selectedAccount.customer || { nombre: 'Consumidor Final' },
          monto: numericMonto,
          formaPago: formaPago,
          transferDetails: formaPago === 'TRANSFERENCIA' ? {
            recipientName: transferRecipient,
            bank: transferBank,
            reference: transferReference
          } : null,
          fechaPago: new Date(fechaPago + 'T12:00:00.000Z').toISOString(),
          cajeroUid: currentUser?.uid || 'UNKNOWN',
          usuarioNombre: currentUser?.displayName || currentUser?.email || 'Cajero POS',
          observacion: observacion.trim() || '',
          createdAt: new Date().toISOString(),
          estado: 'COMPLETADO'
        };

        transaction.set(newCobroRef, cobroPayload);

        // Actualizar documento de la venta
        transaction.update(ventaRef, {
          'paymentDetails.totalPagadoCredito': newTotalPagado,
          'paymentDetails.saldoPendiente': newSaldo,
          'paymentDetails.estadoCredito': newEstadoCredito,
          'paymentDetails.fechaUltimoPago': new Date(fechaPago + 'T12:00:00.000Z').toISOString(),
          saldoPendiente: newSaldo,
          totalPagadoCredito: newTotalPagado,
          estadoCredito: newEstadoCredito,
          fechaUltimoPago: new Date(fechaPago + 'T12:00:00.000Z').toISOString()
        });
      });

      alert(`✅ Cobro de $${numericMonto.toFixed(2)} registrado con éxito.`);
      setSelectedAccount(null);

    } catch (err) {
      console.error("❌ Error en la transacción de cobro:", err);
      setErrorMessage(`Error al procesar el cobro: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', overflowY: 'auto' }}>
      
      {/* Encabezado Principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CreditCard size={28} style={{ color: 'var(--accent)' }} /> Cuentas por Cobrar
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Control de ventas a crédito, abonos parciales y cobros pendientes
          </p>
        </div>
      </div>

      {/* Tarjetas KPI de Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL PENDIENTE</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(kpis.totalPendiente)}</div>
          </div>
        </div>

        <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL COBRADO</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{formatCurrency(kpis.totalCobrado)}</div>
          </div>
        </div>

        <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>CLIENTES CON DEUDA</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>{kpis.clientsWithDebtCount}</div>
          </div>
        </div>

        <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Receipt size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>CUENTAS PENDIENTES</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>{kpis.pendingCount}</div>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        
        {/* Búsqueda rápida */}
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar por cliente, RUC o factura..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 38px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.9rem' }}
          />
        </div>

        {/* Filtro por Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Estado:</label>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
          >
            <option value="PENDIENTES">Pendientes y Abonadas</option>
            <option value="PAGADAS">Pagadas ($0.00)</option>
            <option value="TODAS">Todas las Cuentas</option>
          </select>
        </div>

        {/* Filtro por Fechas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Desde:</label>
          <input 
            type="date" 
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
          />
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Hasta:</label>
          <input 
            type="date" 
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Tabla Principal */}
      <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--accent)' }} />
            <div>Cargando cuentas por cobrar...</div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <AlertCircle size={40} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>No se encontraron cuentas por cobrar</h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem' }}>Pruebe cambiando los filtros de búsqueda</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, rgba(255, 255, 255, 0.03))', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px' }}>Fecha Venta</th>
                  <th style={{ padding: '12px 16px' }}>Cliente</th>
                  <th style={{ padding: '12px 16px' }}>Comprobante</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Venta</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Valor Pagado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Saldo Pendiente</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map(sale => {
                  const totalVenta = sale.totals?.total || sale.total || 0;
                  const creditAmt = sale.paymentDetails?.creditAmount ?? (sale.creditAmount !== undefined ? sale.creditAmount : totalVenta);
                  const paidAmt = sale.paymentDetails?.totalPagadoCredito ?? (sale.totalPagadoCredito || 0);
                  const pendingAmt = Math.max(0, Number((creditAmt - paidAmt).toFixed(2)));
                  const estadoCredito = pendingAmt === 0 ? 'PAGADA' : (paidAmt > 0 ? 'ABONADA' : 'PENDIENTE');

                  const clientObj = sale.cliente || sale.customer || {};
                  const clientName = clientObj.nombre || 'Consumidor Final';
                  const clientDoc = clientObj.numeroIdentificacion ? `(${clientObj.numeroIdentificacion})` : '';

                  return (
                    <tr key={sale.id} style={{ borderBottom: '1px solid var(--panel-border)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {parseDateStr(sale.fechaTransaccion || sale.date)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{clientName}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{clientDoc}</div>
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--accent)' }}>
                        {sale.numeroComprobante || sale.secuencial || 'S/N'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(totalVenta)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>
                        {formatCurrency(paidAmt)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: pendingAmt > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 700 }}>
                        {formatCurrency(pendingAmt)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: estadoCredito === 'PAGADA' ? 'rgba(34, 197, 94, 0.15)' : estadoCredito === 'ABONADA' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: estadoCredito === 'PAGADA' ? '#22c55e' : estadoCredito === 'ABONADA' ? '#f59e0b' : '#ef4444',
                          border: `1px solid ${estadoCredito === 'PAGADA' ? 'rgba(34, 197, 94, 0.3)' : estadoCredito === 'ABONADA' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}>
                          {estadoCredito}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {pendingAmt > 0 && (
                            <button
                              onClick={() => handleOpenCobroModal(sale)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: 'var(--accent)',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <DollarSign size={14} /> Cobrar
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenHistoryModal(sale)}
                            title="Ver Historial de Pagos"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--panel-border)',
                              background: 'var(--bg-main)',
                              color: 'var(--text-main)',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <History size={14} /> Historial
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cobro */}
      {selectedAccount && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
            
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarSign style={{ color: 'var(--accent)' }} /> Registrar Cobro / Abono
              </h3>
              <button onClick={() => !isProcessing && setSelectedAccount(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmCobro} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Resumen de la Cuenta */}
              <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Comprobante:</strong> {selectedAccount.numeroComprobante || selectedAccount.secuencial}</div>
                <div><strong>Cliente:</strong> {(selectedAccount.cliente || selectedAccount.customer)?.nombre}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--panel-border)' }}>
                  <span>Total Venta: <strong>{formatCurrency(selectedAccount.totals?.total || selectedAccount.total)}</strong></span>
                  <span style={{ color: '#ef4444' }}>Saldo Pendiente: <strong>{formatCurrency(Math.max(0, (selectedAccount.totals?.total || selectedAccount.total || 0) - (selectedAccount.paymentDetails?.totalPagadoCredito || 0)))}</strong></span>
                </div>
              </div>

              {errorMessage && (
                <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.85rem' }}>
                  {errorMessage}
                </div>
              )}

              {/* Monto a Cobrar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Monto a Cobrar ($):</label>
                  <button 
                    type="button"
                    onClick={() => setMontoCobro(Math.max(0, (selectedAccount.totals?.total || selectedAccount.total || 0) - (selectedAccount.paymentDetails?.totalPagadoCredito || 0)).toFixed(2))}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Cobro Total
                  </button>
                </div>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01"
                  max={Math.max(0, (selectedAccount.totals?.total || selectedAccount.total || 0) - (selectedAccount.paymentDetails?.totalPagadoCredito || 0))}
                  required
                  value={montoCobro}
                  onChange={(e) => setMontoCobro(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 700 }}
                />
              </div>

              {/* Forma de Pago */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Forma de Pago Recibida:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setFormaPago('EFECTIVO')}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: `2px solid ${formaPago === 'EFECTIVO' ? 'var(--accent)' : 'var(--panel-border)'}`,
                      background: formaPago === 'EFECTIVO' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-main)',
                      color: 'var(--text-main)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormaPago('TRANSFERENCIA')}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: `2px solid ${formaPago === 'TRANSFERENCIA' ? 'var(--accent)' : 'var(--panel-border)'}`,
                      background: formaPago === 'TRANSFERENCIA' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-main)',
                      color: 'var(--text-main)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    🏦 Transferencia
                  </button>
                </div>
              </div>

              {formaPago === 'TRANSFERENCIA' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Titular / Hermano Destino:</label>
                    <select 
                      value={transferRecipient} 
                      onChange={(e) => setTransferRecipient(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                    >
                      <option value="Edgar">Edgar</option>
                      <option value="Fabián">Fabián (Domingo Sánchez)</option>
                      <option value="Amparito">Amparito</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Banco:</label>
                    <input 
                      type="text" 
                      placeholder="Ej. Pichincha, Guayaquil..." 
                      value={transferBank} 
                      onChange={(e) => setTransferBank(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No. Referencia / Comprobante:</label>
                    <input 
                      type="text" 
                      placeholder="Ej. 12345678" 
                      value={transferReference} 
                      onChange={(e) => setTransferReference(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              )}

              {/* Fecha del Pago */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Fecha de Recepción del Dinero:</label>
                <input 
                  type="date" 
                  required
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                />
              </div>

              {/* Observación */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Observación (Opcional):</label>
                <textarea 
                  rows="2"
                  placeholder="Notas adicionales del pago..."
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Botón de Confirmación con Bloqueo de Doble Clic */}
              <button 
                type="submit"
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isProcessing ? 'var(--text-muted)' : 'var(--accent)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '6px'
                }}
              >
                {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <DollarSign size={20} />}
                {isProcessing ? 'Procesando Cobro...' : 'Confirmar Cobro'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Historial de Pagos */}
      {historyAccount && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '16px', width: '100%', maxWidth: '580px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
            
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History style={{ color: 'var(--accent)' }} /> Historial de Abonos
              </h3>
              <button onClick={() => setHistoryAccount(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto' }}>
              <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.85rem' }}>
                <div><strong>Comprobante:</strong> {historyAccount.numeroComprobante || historyAccount.secuencial}</div>
                <div><strong>Cliente:</strong> {(historyAccount.cliente || historyAccount.customer)?.nombre}</div>
              </div>

              {historyList.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No hay pagos o abonos registrados aún para esta venta a crédito.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {historyList.map(item => (
                    <div key={item.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{parseDateStr(item.fechaPago || item.createdAt)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Método: <strong>{item.formaPago}</strong> | Registrado por: {item.usuarioNombre || 'Cajero'}
                        </div>
                        {item.observacion && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                            "{item.observacion}"
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#22c55e' }}>
                        +{formatCurrency(item.monto)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
