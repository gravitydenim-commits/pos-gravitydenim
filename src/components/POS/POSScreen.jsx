import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Tag, Shirt, UserCircle, Printer, CreditCard, User, Search, Loader2, ShoppingBag, Scissors, Package, Briefcase, Glasses, Watch, Gem } from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { validarCedula, validarRUC } from '../../utils/validators';
import { TAX_CONFIG, calculateTotals } from '../../utils/taxes';

// Los productos ahora vienen de Firebase/App.js como productsDB

export default function POSScreen({ issuers, productsDB, salesDB = [], recordSale, customersDB, recordCustomer }) {
  const [cart, setCart] = useState([]);
  const [vatIncluded, setVatIncluded] = useState(true);
  const [selectedIssuer, setSelectedIssuer] = useState(''); 
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [checkoutWithPrint, setCheckoutWithPrint] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [users, setUsers] = useState([]);
  const [mixCashAmount, setMixCashAmount] = useState(0);
  const [mixTransferAmount, setMixTransferAmount] = useState(0);
  const [transferBank, setTransferBank] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [transferRecipientId, setTransferRecipientId] = useState(''); // brother user id

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { getDocs, collection } = await import('firebase/firestore');
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(list);
        
        // Auto select Edgar as default transfer recipient if found
        const edgar = list.find(u => (u.name || '').toLowerCase().includes('edgar'));
        if (edgar) {
          setTransferRecipientId(edgar.id);
          setTransferRecipient(edgar.name);
        } else if (list.length > 0) {
          setTransferRecipientId(list[0].id);
          setTransferRecipient(list[0].name);
        }
      } catch (err) {
        console.error("Error cargando usuarios:", err);
      }
    };
    fetchUsers();
  }, []);

  const [isNotaVenta, setIsNotaVenta] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Previene doble clic
  const [transferQrs, setTransferQrs] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'transfer_qrs'), (docSnap) => {
      if (docSnap.exists()) {
        setTransferQrs(docSnap.data());
      }
    });
    return () => unsub();
  }, []);

  // Calcular los productos más vendidos
  const sortedProducts = useMemo(() => {
    const productSales = {};
    salesDB.forEach(sale => {
      (sale.items || []).forEach(item => {
        if (!productSales[item.id]) productSales[item.id] = 0;
        productSales[item.id] += item.qty;
      });
    });

    return [...productsDB].sort((a, b) => {
      const salesA = productSales[a.id] || 0;
      const salesB = productSales[b.id] || 0;
      return salesB - salesA;
    });
  }, [productsDB, salesDB]);

  // --- DATOS DEL CLIENTE ---
  const [customer, setCustomer] = useState({
    tipoDocumento: 'CEDULA',
    numeroIdentificacion: '',
    nombre: '',
    correo: '',
    direccion: '',
    telefono: ''
  });
  
  const [isSearchingClient, setIsSearchingClient] = useState(false);

  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
    
    let tipoDoc = customer.tipoDocumento;
    if (name === 'numeroIdentificacion') {
      const val = value.trim();
      if (val === '9999999999999' || val === '9999999999') {
         tipoDoc = 'CONSUMIDOR_FINAL';
      } else if (val.length === 13 && val !== '9999999999999') {
         tipoDoc = 'RUC';
      } else if (val.length === 10 && val !== '9999999999') {
         tipoDoc = 'CEDULA';
      }
    }

    setCustomer(prev => ({ 
      ...prev, 
      [name]: value,
      ...(name === 'numeroIdentificacion' ? { tipoDocumento: tipoDoc } : {})
    }));
  };

  const handleDocumentTypeChange = (e) => {
    const tipo = e.target.value;
    if (tipo === 'CONSUMIDOR_FINAL') {
      setCustomer({
        tipoDocumento: tipo,
        numeroIdentificacion: '9999999999999',
        nombre: 'CONSUMIDOR FINAL',
        correo: 'N/A',
        direccion: 'N/A',
        telefono: 'N/A'
      });
    } else {
      setCustomer({
        tipoDocumento: tipo,
        numeroIdentificacion: '',
        nombre: '',
        correo: '',
        direccion: '',
        telefono: ''
      });
    }
  };

  // --- BÚSQUEDA AUTOMÁTICA DE CLIENTES ---
  const manejarBuscarCliente = async () => {
    const numId = (customer.numeroIdentificacion || '').trim();
    if (!numId || numId.length < 5) return;
    if (customer.tipoDocumento === 'CONSUMIDOR_FINAL') return;

    setIsSearchingClient(true);
    console.log(`🔍 Buscando cliente con CI/RUC: ${numId}...`);

    try {
      // Búsqueda directa en la colección 'clientes' usando el ID del documento
      const docRef = doc(db, 'clientes', numId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const clienteEncontrado = docSnap.data();
        console.log("✅ Cliente encontrado en Firestore.");
        setCustomer({
          ...customer,
          nombre: clienteEncontrado.nombre || '',
          correo: clienteEncontrado.correo || '',
          direccion: clienteEncontrado.direccion || '',
          telefono: clienteEncontrado.telefono || ''
        });
      } else {
        // Sin alertas intrusivas, simplemente limpiamos para ingreso manual
        console.log("🌐 Cliente no existe en base de datos. Inputs habilitados para ingreso manual.");
        setCustomer({
          ...customer,
          nombre: '',
          correo: '',
          direccion: '',
          telefono: ''
        });
      }
    } catch (error) {
      console.error("❌ Error en la búsqueda de cliente:", error);
    } finally {
      setIsSearchingClient(false);
    }
  };

  const isConsumidorFinal = customer.tipoDocumento === 'CONSUMIDOR_FINAL';

  // --- HANDLERS ---
  const addToCart = (product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prevCart, { 
        ...product, 
        price: product.precioBase !== undefined ? parseFloat(product.precioBase) : parseFloat(product.price),
        name: product.nombre || product.name,
        qty: 1 
      }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart((prev) => {
      const updated = prev.map(item => {
        if (item.id === id) {
          return { ...item, qty: item.qty + delta };
        }
        return item;
      });
      return updated.filter(item => item.qty > 0);
    });
  };

  const removeRow = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateCustomPrice = (id, newPrice) => {
    const val = parseFloat(newPrice);
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, price: isNaN(val) ? 0 : val } : item
    ));
  };

  // --- MATH / VAT LOGIC (Función única centralizada calculateTotals) ---
  const { subtotal, baseImponible, ivaAmount, total } = useMemo(() => {
    return calculateTotals(cart, vatIncluded, isNotaVenta);
  }, [cart, vatIncluded, isNotaVenta]);

  // --- SINCRONIZACIÓN PANTALLA SECUNDARIA ---
  useEffect(() => {
    // Si isProcessing es true, lo mostramos como 'paid' temporalmente (o 'checkout' procesando).
    // Si showPreviewModal es true, está en 'checkout'.
    // Si isProcessing termina, se limpia y vuelve a 'idle'.
    let status = 'idle';
    if (showPreviewModal) status = 'checkout';
    
    // Si acabamos de procesar con éxito, el cart se limpia, pero queremos mandar un ping de éxito.
    // Esto lo manejamos enviando 'paid' desde confirmCheckout, pero aquí mantenemos el estado actual.

    try {
      const channel = new BroadcastChannel('gravity_pos_channel');
      channel.postMessage({
        type: 'STATE_UPDATE',
        payload: {
          status,
          total,
          paymentMethod,
          transferRecipient,
          qrUrl: transferQrs[transferRecipient] || null
        }
      });
      channel.close();
    } catch (e) {
      console.error("Error broadcasting to secondary screen", e);
    }
  }, [total, paymentMethod, showPreviewModal, transferRecipient, transferQrs]);


  // --- PROCESAR PAGO (GATILLO DE VISTA PREVIA) ---
  const handleCheckout = (withPrint) => {
    if (!selectedIssuer) {
      alert("⚠️ DEBES SELECCIONAR UN EMISOR (HERMANO) ANTES DE COBRAR.");
      return;
    }
    
    if (!customer.numeroIdentificacion || !customer.nombre) {
      alert("⚠️ DEBES COMPLETAR LOS DATOS DEL CLIENTE.");
      return;
    }

    if (cart.length === 0) {
      alert("⚠️ EL CARRITO ESTÁ VACÍO.");
      return;
    }

    if (!isNotaVenta) {
      const ci = customer.numeroIdentificacion.trim();
      const tipo = customer.tipoDocumento;
      if (tipo === 'CEDULA') {
        if (ci.length !== 10 && ci !== '9999999999') {
          alert("⚠️ EL NÚMERO DE CÉDULA DEBE TENER EXACTAMENTE 10 DÍGITOS.\n\nPara RUCs (13 dígitos) cambia el tipo de documento a RUC.");
          return;
        }
        if (!validarCedula(ci)) {
          alert("❌ LA CÉDULA INGRESADA ES INVÁLIDA.\n\nPor favor, verifica el número y vuelve a intentarlo.");
          return;
        }
      }
      if (tipo === 'RUC') {
        if (ci.length !== 13 && ci !== '9999999999999') {
          alert("⚠️ EL RUC DEBE TENER EXACTAMENTE 13 DÍGITOS.");
          return;
        }
        if (!validarRUC(ci)) {
          alert("❌ EL RUC INGRESADO ES INVÁLIDO.\n\nPor favor, verifica el número y vuelve a intentarlo.");
          return;
        }
      }
      if (tipo === 'CONSUMIDOR_FINAL' && ci !== '9999999999999' && ci !== '9999999999') {
        alert("⚠️ PARA CONSUMIDOR FINAL EL NÚMERO DEBE SER 9999999999999.");
        return;
      }
    }

    setCheckoutWithPrint(withPrint);
    setShowPreviewModal(true);
  };

  // --- CONFIRMAR PAGO REAL (SRI Y FIREBASE) ---
  const confirmCheckout = async () => {
    if (isProcessing) return; // Bloqueo anti doble clic

    if (paymentMethod === 'TRANSFERENCIA' && !transferRecipientId) {
      alert("⚠️ DEBES SELECCIONAR A QUIÉN SE REALIZÓ LA TRANSFERENCIA.");
      return;
    }

    setIsProcessing(true);
    const isFacturaSri = !isNotaVenta;
    setShowPreviewModal(false);
    
    const withPrint = checkoutWithPrint;
    const issuerData = issuers.find(i => i.id === selectedIssuer);
    if (!issuerData) {
      setIsProcessing(false);
      return;
    }

    // Generar Llave de Idempotencia única para esta transacción
    const transactionId = crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Construir paymentDetails estructurado (Simplificado sin MIXTO)
    const paymentDetails = {
      method: paymentMethod,
      cashAmount: paymentMethod === 'EFECTIVO' ? total : 0,
      transfers: paymentMethod === 'TRANSFERENCIA' ? [
        {
          recipientId: transferRecipientId,
          recipientName: transferRecipient,
          amount: total,
          bank: transferBank,
          reference: transferReference
        }
      ] : []
    };

    try {
      const totalsData = { subtotal, baseImponible, ivaAmount, total };

      // 0. Guardado Inmediato de Cliente (Antes del SRI y el stock)
      if (customer.tipoDocumento !== 'CONSUMIDOR_FINAL' && customer.numeroIdentificacion) {
        console.log("👤 [Cliente] Guardando/Actualizando cliente en Firebase inmediatamente...");
        try {
          await setDoc(doc(db, "clientes", customer.numeroIdentificacion), {
            ...customer,
            fechaTransaccion: new Date().toISOString()
          }, { merge: true });
          console.log("✅ Cliente guardado/actualizado con éxito en la colección 'clientes'.");
        } catch (err) {
          console.error("❌ Error guardando cliente:", err);
        }
      }

      // 1. Enviar petición a nuestro backend interno (Centralizado para SRI, Notas de Venta y Stock)
      console.log(`🚀 Enviando petición al backend interno (isNotaVenta: ${isNotaVenta})...`);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const idToken = await auth.currentUser.getIdToken();

      const response = await fetch('/api/sri/emitir', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ 
          productos: cart, 
          cliente: customer, 
          emisorId: issuerData.id,
          formaPago: paymentMethod === 'EFECTIVO' ? '01' : '20', // 01=Efectivo, 20=Otros con sistema financiero
          transactionId: transactionId,
          subtotal,
          ivaAmount,
          total,
          vatIncluded,
          isNotaVenta: isNotaVenta,
          paymentMethod,
          transferRecipient,
          transferRecipientId,
          transferBank,
          transferReference,
          paymentDetails
        })
      });
      
      let sriData = {};
      const textResponse = await response.text();
      console.log("Raw API Response:", textResponse);
      try {
        sriData = JSON.parse(textResponse);
      } catch (e) {
        throw new Error(`Código de Error HTTP ${response.status}\n\nRespuesta del Servidor:\n${textResponse.substring(0, 500)}`);
      }
      
      const claveAcceso = sriData.claveAcceso || `FALLBACK-${Date.now()}`;
      const estadoFactura = sriData.estado;
      
      if (!response.ok) {
         const errorMsg = sriData.error || sriData.message || `Error HTTP ${response.status} en el servidor al procesar la venta.`;
         const sriMsgs = Array.isArray(sriData.mensajes) && sriData.mensajes.length > 0 
           ? `\n\nMensajes SRI:\n` + sriData.mensajes.map(m => `- [${m.identificador || ''}] ${m.mensaje || ''} (${m.informacionAdicional || ''})`).join('\n')
           : '';
         const stackTrace = sriData.stack ? `\n\nSTACK:\n${sriData.stack}` : '';
         throw new Error(`Endpoint: /api/sri/emitir (HTTP ${response.status})\nEstado SRI: ${estadoFactura || 'ERROR'}\nMotivo: ${errorMsg}${sriMsgs}${stackTrace}`);
      }

      if (estadoFactura === 'PENDIENTE_ENVIO' || estadoFactura === 'CONTINGENCIA_LOCAL') {
        alert(`⚠️ Sin conexión o fallo temporal con el SRI (HTTP ${response.status}). La venta se guardó localmente en estado PENDIENTE_ENVIO.\nMotivo: ${sriData.error || 'Timeout'}\nClave temporal: ${claveAcceso}`);
      } else if (estadoFactura === 'DEVUELTA' || estadoFactura === 'NO_AUTORIZADO' || estadoFactura === 'RECHAZADA') {
        const msgs = Array.isArray(sriData.mensajes) && sriData.mensajes.length > 0 
          ? `\nDetalles: ` + sriData.mensajes.map(m => `[${m.identificador}] ${m.mensaje} - ${m.informacionAdicional}`).join(' | ')
          : '';
        throw new Error(`Factura ${estadoFactura} por el SRI.\nMotivo: ${sriData.error || 'Rechazo'}${msgs}`);
      }

      // (La lógica de guardado de cliente fue trasladada al paso 0, al inicio de confirmCheckout)
      // La lógica de Stock y Guardado de Venta fue movida al Backend (emitir.js) 
      // para evitar duplicaciones y ser parte del commit atómico del SRI.

      // 3. Imprimir si corresponde
      if (withPrint) {
        const format = localStorage.getItem('printerFormat') || '80mm';
        const method = localStorage.getItem('printerMethod') || 'sistema';

        if (format === '58mm' && method === 'bluetooth_58') {
          import('../../lib/Printer58Service').then(async (module) => {
            try {
              await module.printer58Service.printTicket(
                issuerData, 
                customer, 
                cart, 
                subtotal, 
                ivaAmount, 
                total, 
                { numeroComprobante: sriData.numeroComprobante || '', claveAcceso, isNotaVenta },
                paymentMethod
              );
            } catch (err) {
              console.error("Fallo impresión 58mm Web Bluetooth, usando sistema:", err);
              import('../../utils/printTicket').then(fallbackMod => {
                fallbackMod.imprimirTicket(issuerData, cart, totalsData, customer, claveAcceso, paymentMethod, paymentMethod === 'TRANSFERENCIA' ? transferRecipient : null, isNotaVenta, format);
              });
            }
          });
        } else {
          import('../../utils/printTicket').then(module => {
            module.imprimirTicket(
              issuerData, 
              cart, 
              totalsData, 
              customer, 
              claveAcceso, 
              paymentMethod, 
              paymentMethod === 'TRANSFERENCIA' ? transferRecipient : null, 
              isNotaVenta, 
              format
            );
          });
        }
      } else {
        console.log("🖨️ [RIDE] Impresión física omitida por el operador.");
      }

      alert(`Venta guardada exitosamente por ${issuerData.name}\n${withPrint ? 'Ticket enviado a la impresora.' : 'Sin impresión física.'}`);
      
      // Ping a la pantalla secundaria
      try {
        const channel = new BroadcastChannel('gravity_pos_channel');
        channel.postMessage({ type: 'STATE_UPDATE', payload: { status: 'paid', total: 0, paymentMethod: 'EFECTIVO' } });
        channel.close();
      } catch(e){}

      // 5. Limpiar carrito y resetear form con retraso para asegurar impresión térmica
      setTimeout(() => {
        setCart([]);
        setPaymentMethod('EFECTIVO');
        setCustomer({
          tipoDocumento: 'CEDULA',
          numeroIdentificacion: '',
          nombre: '',
          correo: '',
          direccion: '',
          telefono: ''
        });
        setVatIncluded(true);
        setPaymentMethod('EFECTIVO');
        setTransferRecipient('');
        setIsNotaVenta(false);
        setIsSearchingClient(false);
      }, 500);
    } catch (error) {
      alert(`⚠️ Ocurrió un error en el pago: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Inline styling estético para los inputs
  const inputStyle = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-main)',
    padding: '8px',
    width: '100%',
    fontFamily: 'Inter',
    fontSize: '0.85rem',
    outline: 'none'
  };

  const inputContainerStyle = {
    background: 'var(--input-bg)',
    border: '1px solid var(--panel-border)',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden'
  };

  return (
    <div className="pos-container animate-fade-in">
      {/* LEFT: PRODUCTS GRID */}
      <div className="products-section glass-panel">
        <div className="header" style={{ alignItems: 'center' }}>
          <h2><Shirt className="inline" style={{verticalAlign: 'bottom'}}/> Catálogo Compartido</h2>
          
          <div className="issuer-selector">
            <UserCircle size={20} style={{color: 'var(--text-muted)'}} />
            <select 
              value={selectedIssuer} 
              onChange={(e) => setSelectedIssuer(e.target.value)}
              className={selectedIssuer ? 'selected' : 'unselected'}
              style={{ background: 'var(--input-bg)', color: 'var(--text-main)', border: 'none', outline: 'none' }}
            >
              <option value="" disabled style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>-- Seleccione Emisor (Hermano) --</option>
              {issuers.map(issuer => (
                <option key={issuer.id} value={issuer.id} style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>{issuer.name} (RUC: {issuer.ruc.slice(-4)})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="products-grid">
          {sortedProducts.map((prod) => {
            const nombreLower = (prod.nombre || prod.name || '').trim().toLowerCase();
            const catLower = (prod.categoria || '').trim().toLowerCase();
            
            // 1. Resolver tipo de prenda de forma dinámica (Priorizar campo tipoPrenda si existe en DB)
            let tipo = (prod.tipoPrenda || prod.tipo_prenda || '').trim();
            
            // Fallback: Autodetectar tipo de prenda a partir del nombre o categoría para compatibilidad
            if (!tipo) {
              if (nombreLower.includes('baggy')) {
                tipo = 'Jean Baggy';
              } else if (nombreLower.includes('semitubo')) {
                tipo = 'Jean Semitubo';
              } else if (nombreLower.includes('slim')) {
                tipo = 'Jean Slim';
              } else if (nombreLower.includes('recto')) {
                tipo = 'Jean Recto';
              } else if (nombreLower.includes('tactico') || nombreLower.includes('táctico') || nombreLower.includes('tactical')) {
                tipo = 'Pantalón Táctico';
              } else if (nombreLower.includes('polo')) {
                tipo = 'Polo';
              } else if (nombreLower.includes('camiseta') && (nombreLower.includes('mujer') || nombreLower.includes('dama'))) {
                tipo = 'Camiseta Mujer';
              } else if (nombreLower.includes('camiseta')) {
                tipo = 'Camiseta';
              } else if (nombreLower.includes('camisa') && (nombreLower.includes('manga corta') || nombreLower.includes('mc') || nombreLower.includes('corta'))) {
                tipo = 'Camisa Manga Corta';
              } else if (nombreLower.includes('camisa') && (nombreLower.includes('manga larga') || nombreLower.includes('ml') || nombreLower.includes('larga'))) {
                tipo = 'Camisa Manga Larga';
              } else if (nombreLower.includes('camisa') && nombreLower.includes('cuadros')) {
                tipo = 'Camisa Cuadros';
              } else if (nombreLower.includes('camisa') && nombreLower.includes('gabardina')) {
                tipo = 'Camisa Gabardina';
              } else if (nombreLower.includes('camisa')) {
                tipo = 'Camisa Manga Corta';
              } else if (nombreLower.includes('jogger')) {
                tipo = 'Jogger';
              } else if (nombreLower.includes('cargo')) {
                tipo = 'Pantalón Cargo';
              } else if (nombreLower.includes('short')) {
                tipo = 'Short';
              } else if (nombreLower.includes('bermuda')) {
                tipo = 'Bermuda';
              } else if (nombreLower.includes('blusa')) {
                tipo = 'Blusa';
              } else if (nombreLower.includes('chaqueta') && nombreLower.includes('gabardina')) {
                tipo = 'Chaqueta Gabardina';
              } else if (nombreLower.includes('chaqueta')) {
                tipo = 'Chaqueta Jean';
              } else if (nombreLower.includes('chaleco')) {
                tipo = 'Chaleco';
              } else if (nombreLower.includes('overol')) {
                tipo = 'Overol';
              } else if (nombreLower.includes('falda')) {
                tipo = 'Falda';
              } else if (nombreLower.includes('vestido')) {
                tipo = 'Vestido';
              } else if (nombreLower.includes('niño') || nombreLower.includes('nino')) {
                tipo = 'Jean Niño';
              } else if (nombreLower.includes('jean') || nombreLower.includes('pantalon') || nombreLower.includes('pantalón')) {
                tipo = 'Jean Recto';
              } else {
                if (catLower.includes('jean') || catLower.includes('pantal')) {
                  tipo = 'Jean Recto';
                } else if (catLower.includes('camisa')) {
                  tipo = 'Camisa Manga Corta';
                } else if (catLower.includes('polo')) {
                  tipo = 'Polo';
                } else if (catLower.includes('blusa')) {
                  tipo = 'Blusa';
                } else if (catLower.includes('chaqueta')) {
                  tipo = 'Chaqueta Jean';
                } else if (catLower.includes('short')) {
                  tipo = 'Short';
                } else if (catLower.includes('jogger')) {
                  tipo = 'Jogger';
                } else if (catLower.includes('bermuda')) {
                  tipo = 'Bermuda';
                } else if (catLower.includes('falda')) {
                  tipo = 'Falda';
                } else {
                  tipo = 'Otros';
                }
              }
            }

            // 2. Badge visual por tipo
            const tipoLower = tipo.toLowerCase();
            let label = tipo.toUpperCase();
            let badgeBg = 'rgba(16, 185, 129, 0.15)';
            let badgeColor = '#34d399';

            if (tipoLower.includes('jean') || tipoLower.includes('pantalón') || tipoLower.includes('pantalon')) {
              badgeBg = 'rgba(59, 130, 246, 0.15)'; badgeColor = '#60a5fa';
            } else if (tipoLower.includes('tactico') || tipoLower.includes('táctico') || tipoLower.includes('tactical')) {
              label = 'TACTICAL'; badgeBg = 'rgba(16, 185, 129, 0.2)'; badgeColor = '#10b981';
            } else if (tipoLower.includes('cargo')) {
              label = 'CARGO'; badgeBg = 'rgba(59, 130, 246, 0.15)'; badgeColor = '#60a5fa';
            } else if (tipoLower.includes('short')) {
              label = 'SHORT'; badgeBg = 'rgba(59, 130, 246, 0.12)'; badgeColor = '#93c5fd';
            } else if (tipoLower.includes('bermuda')) {
              label = 'BERMUDA'; badgeBg = 'rgba(249, 115, 22, 0.12)'; badgeColor = '#fdba74';
            } else if (tipoLower.includes('jogger')) {
              label = 'JOGGER'; badgeBg = 'rgba(59, 130, 246, 0.1)'; badgeColor = '#a5f3fc';
            } else if (tipoLower.includes('camisa')) {
              badgeBg = 'rgba(6, 182, 212, 0.15)'; badgeColor = '#22d3ee';
              if (tipoLower.includes('corta') || tipoLower.includes('mc')) label = 'CAMISA M.C.';
              else if (tipoLower.includes('larga') || tipoLower.includes('ml')) label = 'CAMISA M.L.';
              else if (tipoLower.includes('cuadros')) label = 'CUADROS';
              else if (tipoLower.includes('gabardina')) label = 'GABARDINA';
            } else if (tipoLower.includes('polo')) {
              label = 'POLO'; badgeBg = 'rgba(239, 68, 68, 0.15)'; badgeColor = '#f87171';
            } else if (tipoLower.includes('camiseta')) {
              badgeBg = 'rgba(239, 68, 68, 0.12)'; badgeColor = '#fca5a5';
              label = (tipoLower.includes('mujer') || tipoLower.includes('dama')) ? 'CAMISETA MUJER' : 'CAMISETA';
            } else if (tipoLower.includes('blusa')) {
              label = 'BLUSA'; badgeBg = 'rgba(168, 85, 247, 0.15)'; badgeColor = '#c084fc';
            } else if (tipoLower.includes('chaqueta')) {
              label = tipoLower.includes('gabardina') ? 'CHAQUETA GAB.' : 'CHAQUETA JEAN';
              badgeBg = 'rgba(249, 115, 22, 0.15)'; badgeColor = '#fb923c';
            } else if (tipoLower.includes('chaleco')) {
              label = 'CHALECO'; badgeBg = 'rgba(251, 191, 36, 0.15)'; badgeColor = '#fcd34d';
            } else if (tipoLower.includes('overol')) {
              label = 'OVEROL'; badgeBg = 'rgba(59, 130, 246, 0.15)'; badgeColor = '#60a5fa';
            } else if (tipoLower.includes('falda')) {
              label = 'FALDA'; badgeBg = 'rgba(236, 72, 153, 0.15)'; badgeColor = '#f9a8d4';
            } else if (tipoLower.includes('vestido')) {
              label = 'VESTIDO'; badgeBg = 'rgba(236, 72, 153, 0.15)'; badgeColor = '#f472b6';
            }

            // 3. Prioridad de visualización de imagen
            const validCustomImg = (url) => typeof url === 'string' && url.trim() !== '' && url !== 'undefined' && url !== 'null' && url !== 'N/A' && !url.includes('undefined');

            let activeImage = null;
            if (validCustomImg(prod.imageUrl)) {
              activeImage = prod.imageUrl;
            } else if (validCustomImg(prod.image)) {
              activeImage = prod.image;
            } else if (validCustomImg(prod.ilustracion3d) || validCustomImg(prod.ilustracion_3d)) {
              const fileKey = prod.ilustracion3d || prod.ilustracion_3d;
              activeImage = `/product-illustrations/3d/${fileKey.endsWith('.png') ? fileKey : fileKey + '.png'}`;
            }

            if (!activeImage) {
              // P3 — fallback automático por tipo inferido del nombre
              const BASE = '/product-illustrations/3d/';
              if (tipoLower.includes('polo'))                                                                           activeImage = BASE + 'polo_cuello_3d.png';
              else if (tipoLower.includes('camiseta') && (tipoLower.includes('mujer') || tipoLower.includes('dama')))   activeImage = BASE + 'camiseta_mujer_3d.png';
              else if (tipoLower.includes('camiseta'))                                                                  activeImage = BASE + 'camiseta_basica_3d.png';
              else if (tipoLower.includes('camisa') && tipoLower.includes('cuadros'))                                   activeImage = BASE + 'camisa_cuadros_3d.png';
              else if (tipoLower.includes('camisa') && tipoLower.includes('gabardina'))                                 activeImage = BASE + 'camisa_gabardina_3d.png';
              else if (tipoLower.includes('camisa') && (tipoLower.includes('larga') || tipoLower.includes('ml')))       activeImage = BASE + 'camisa_manga_larga_3d.png';
              else if (tipoLower.includes('camisa'))                                                                    activeImage = BASE + 'camisa_manga_corta_3d.png';
              else if (tipoLower.includes('blusa'))                                                                     activeImage = BASE + 'blusa_3d.png';
              else if (tipoLower.includes('chaqueta') && tipoLower.includes('gabardina'))                               activeImage = BASE + 'chaqueta_gabardina_3d.png';
              else if (tipoLower.includes('chaqueta'))                                                                  activeImage = BASE + 'chaqueta_jean_3d.png';
              else if (tipoLower.includes('chaleco'))                                                                   activeImage = BASE + 'chaleco_3d.png';
              else if (tipoLower.includes('overol'))                                                                    activeImage = BASE + 'overol_3d.png';
              else if (tipoLower.includes('falda'))                                                                     activeImage = BASE + 'falda_3d.png';
              else if (tipoLower.includes('vestido'))                                                                   activeImage = BASE + 'vestido_3d.png';
              else if (tipoLower.includes('tactico') || tipoLower.includes('táctico') || tipoLower.includes('tactical')) activeImage = BASE + 'pantalon_tactico_3d.png';
              else if (tipoLower.includes('cargo'))                                                                     activeImage = BASE + 'pantalon_cargo_3d.png';
              else if (tipoLower.includes('jogger'))                                                                    activeImage = BASE + 'jogger_3d.png';
              else if (tipoLower.includes('short'))                                                                     activeImage = BASE + 'short_3d.png';
              else if (tipoLower.includes('bermuda'))                                                                   activeImage = BASE + 'bermuda_3d.png';
              else if (tipoLower.includes('semitubo'))                                                                  activeImage = BASE + 'jean_semitubo_3d.png';
              else if (tipoLower.includes('baggy'))                                                                     activeImage = BASE + 'jean_baggy_3d.png';
              else if (tipoLower.includes('niño') || tipoLower.includes('nino'))                                        activeImage = BASE + 'jean_nino_3d.png';
              else if (tipoLower.includes('jean') || tipoLower.includes('pantalon') || tipoLower.includes('pantalón'))  activeImage = BASE + 'jean_recto_3d.png';
              else activeImage = BASE + 'default_3d.png';
            }

            return (
              <div key={prod.id} className="product-card" onClick={() => addToCart(prod)}>
                <span className="product-category-badge" style={{ backgroundColor: badgeBg, color: badgeColor }}>
                  {label}
                </span>
                <div className="product-image-container">
                  <img 
                    src={activeImage} 
                    alt={prod.nombre || prod.name} 
                    className="product-card-image"
                    loading="lazy"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/product-illustrations/3d/default_3d.png';
                    }}
                  />
                </div>
                <div className="product-name">{prod.nombre || prod.name}</div>
                <div className="product-price">${(prod.precioBase || prod.price || 0).toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: CART & TOTALS */}
      <div className="cart-section glass-panel">
        <div className="header" style={{ paddingBottom: '0.5rem' }}>
          <h2><ShoppingCart className="inline" style={{verticalAlign: 'bottom'}}/> Carrito</h2>
        </div>
        
        <div className="cart-container">
          <div className="cart-items" style={{ flex: '1 1 40%' }}>
            {cart.length === 0 && (
              <div style={{textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem'}}>
                El carrito está vacío
              </div>
            )}
            {cart.map(item => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-info">
                  <h4>{item.name}</h4>
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem'}}>
                    <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '1.25rem' }}>$</span>
                    <input 
                      type="number" 
                      value={item.price === 0 ? '' : item.price} 
                      onChange={(e) => updateCustomPrice(item.id, e.target.value)}
                      style={{
                        width: '130px', 
                        padding: '12px 14px', 
                        textAlign: 'right', 
                        background: '#090d16', 
                        border: '2px solid var(--accent)', 
                        borderRadius: '8px', 
                        color: '#10b981', 
                        fontSize: '1.15rem', 
                        fontWeight: '900',
                        outline: 'none',
                        transition: 'all 0.2s',
                        boxShadow: '0 0 10px rgba(59, 130, 246, 0.15)'
                      }}
                      step="0.01"
                    />
                    <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '4px'}}>c/u</span>
                  </div>
                </div>
                
                <div className="cart-item-controls">
                  <button className="btn-danger" onClick={() => updateQuantity(item.id, -1)}><Minus size={16}/></button>
                  <span style={{fontWeight: 'bold', width: '20px', textAlign: 'center'}}>{item.qty}</span>
                  <button className="btn-primary" style={{padding: '8px'}} onClick={() => updateQuantity(item.id, 1)}><Plus size={16}/></button>
                  <button className="btn-danger" onClick={() => removeRow(item.id)}><Trash2 size={16}/></button>
                </div>
                
                <div className="cart-item-price" style={{textAlign: 'right', fontWeight: 'bold'}}>
                  ${(item.price * item.qty).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          <div className="cart-summary" style={{ flex: '1 1 auto', overflowY: 'auto' }}>
            
            {/* FORMULARIO DE CLIENTE SRI */}
            <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)' }}>
                <User size={16} /> Datos del Cliente (SRI)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <select 
                    className="bg-[#1e293b] text-white border border-slate-700 rounded-lg p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    value={customer.tipoDocumento} 
                    onChange={handleDocumentTypeChange}
                  >
                    <option className="bg-[#0f172a] text-white font-medium" value="CEDULA">Cédula</option>
                    <option className="bg-[#0f172a] text-white font-medium" value="RUC">RUC</option>
                    <option className="bg-[#0f172a] text-white font-medium" value="PASAPORTE">Pasaporte</option>
                    <option className="bg-[#0f172a] text-white font-medium" value="CONSUMIDOR_FINAL">Consumidor Final</option>
                  </select>
                </div>

                <div style={inputContainerStyle}>
                  <input 
                    type="text" 
                    name="numeroIdentificacion" 
                    placeholder="Nro. Identificación" 
                    value={customer.numeroIdentificacion} 
                    onChange={handleCustomerChange}
                    onBlur={manejarBuscarCliente}
                    onKeyDown={(e) => e.key === 'Enter' && manejarBuscarCliente()}
                    style={{...inputStyle, color: 'var(--text-main)'}} 
                    className="text-white placeholder:text-gray-400"
                  />
                  <button 
                    onClick={manejarBuscarCliente} 
                    disabled={isSearchingClient}
                    style={{ background: 'transparent', padding: '0 8px', color: 'var(--accent)' }}
                  >
                    {isSearchingClient ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  </button>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={inputContainerStyle}>
                  <input 
                    type="text" 
                    name="nombre" 
                    placeholder="Razón Social / Nombres" 
                    value={customer.nombre} 
                    onChange={handleCustomerChange} 
                    readOnly={false}
                    disabled={false}
                    style={{...inputStyle, color: 'var(--text-main)'}} 
                    className="text-white placeholder:text-gray-400"
                  />
                </div>
                <div style={inputContainerStyle}>
                  <input 
                    type="email" 
                    name="correo" 
                    placeholder="Correo Electrónico" 
                    value={customer.correo} 
                    onChange={handleCustomerChange} 
                    readOnly={false}
                    disabled={false}
                    style={{...inputStyle, color: 'var(--text-main)'}} 
                    className="text-white placeholder:text-gray-400"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={inputContainerStyle}>
                  <input 
                    type="text" 
                    name="direccion" 
                    placeholder="Dirección Completa" 
                    value={customer.direccion} 
                    onChange={handleCustomerChange} 
                    readOnly={false}
                    disabled={false}
                    style={{...inputStyle, color: 'var(--text-main)'}} 
                    className="text-white placeholder:text-gray-400"
                  />
                </div>
                <div style={inputContainerStyle}>
                  <input 
                    type="tel" 
                    name="telefono" 
                    placeholder="Teléfono (Opcional)" 
                    value={customer.telefono} 
                    onChange={handleCustomerChange} 
                    readOnly={false}
                    disabled={false}
                    style={{...inputStyle, color: 'var(--text-main)'}} 
                    className="text-white placeholder:text-gray-400"
                  />
                </div>
              </div>
            </div>

            {/* SWITCH IVA */}
            <div className="vat-switch-container">
              <span>{vatIncluded ? 'IVA Incluido (15%)' : 'Más IVA (+15%)'}</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={vatIncluded} 
                  onChange={(e) => setVatIncluded(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            {/* NOTA DE VENTA BOTON */}
            <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              <button 
                onClick={() => setIsNotaVenta(!isNotaVenta)}
                style={{ 
                  width: '100%',
                  padding: '10px', 
                  borderRadius: '8px', 
                  border: `2px solid ${isNotaVenta ? 'var(--warning)' : 'var(--panel-border)'}`,
                  background: isNotaVenta ? 'rgba(255, 152, 0, 0.2)' : 'transparent',
                  color: isNotaVenta ? 'var(--warning)' : 'var(--text-muted)',
                  fontWeight: isNotaVenta ? 'bold' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s'
                }}
              >
                📝 {isNotaVenta ? 'MODO NOTA DE VENTA (Activo)' : 'Emitir como Nota de Venta (Inactivo)'}
              </button>
            </div>

            {/* MÉTODO DE PAGO */}
            <div style={{ padding: '0.5rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button 
                type="button"
                onClick={() => setPaymentMethod('EFECTIVO')}
                style={{ 
                  flex: 1, 
                  padding: '8px', 
                  borderRadius: '8px', 
                  border: `2px solid ${paymentMethod === 'EFECTIVO' ? 'var(--success)' : 'var(--panel-border)'}`,
                  background: paymentMethod === 'EFECTIVO' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                  color: 'var(--text-main)',
                  fontWeight: paymentMethod === 'EFECTIVO' ? 'bold' : 'normal',
                  cursor: 'pointer'
                }}
              >
                💵 Efectivo
              </button>
              <button 
                type="button"
                onClick={() => setPaymentMethod('TRANSFERENCIA')}
                style={{ 
                  flex: 1, 
                  padding: '8px', 
                  borderRadius: '8px', 
                  border: `2px solid ${paymentMethod === 'TRANSFERENCIA' ? 'var(--success)' : 'var(--panel-border)'}`,
                  background: paymentMethod === 'TRANSFERENCIA' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                  color: 'var(--text-main)',
                  fontWeight: paymentMethod === 'TRANSFERENCIA' ? 'bold' : 'normal',
                  cursor: 'pointer'
                }}
              >
                🏦 Transferencia
              </button>
            </div>

            {paymentMethod === 'TRANSFERENCIA' && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '8px', color: 'white' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cuenta que recibió la transferencia *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '3px' }}>
                    {['Diana', 'Fabian', 'Edgar', 'Amparito'].map((name) => (
                      <button
                        type="button"
                        key={name}
                        onClick={() => {
                          setTransferRecipient(name);
                          const found = users.find(u => (u.name || '').toLowerCase().includes(name.toLowerCase()));
                          if (found) {
                            setTransferRecipientId(found.id);
                          } else {
                            setTransferRecipientId(name);
                          }
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '6px',
                          border: `2px solid ${transferRecipient === name ? '#3b82f6' : 'var(--panel-border)'}`,
                          background: transferRecipient === name ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                          color: transferRecipient === name ? '#3b82f6' : 'var(--text-main)',
                          fontWeight: transferRecipient === name ? 'bold' : 'normal',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Banco:</label>
                    <input 
                      type="text" 
                      placeholder="Ej. Pichincha"
                      value={transferBank}
                      onChange={(e) => setTransferBank(e.target.value)}
                      style={{ padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Referencia:</label>
                    <input 
                      type="text" 
                      placeholder="No. Documento/Ref"
                      value={transferReference}
                      onChange={(e) => setTransferReference(e.target.value)}
                      style={{ padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

              </div>
            )}

            {/* TOTALES */}
            <div className="summary-row">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Base Imponible (15%)</span>
              <span>${baseImponible.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>IVA (15%)</span>
              <span>${ivaAmount.toFixed(2)}</span>
            </div>
            <div className="summary-row total" style={{ marginTop: '0.5rem', marginBottom: '1rem', paddingTop: '0.5rem' }}>
              <span>TOTAL</span>
              <span>${total.toFixed(2)}</span>
            </div>

            {/* BOTONES DE PAGO */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className={`btn-primary ${(!selectedIssuer || cart.length === 0) ? 'disabled' : ''}`} 
                onClick={() => handleCheckout(false)}
                disabled={cart.length === 0}
                style={{
                  flex: 1, 
                  opacity: (cart.length === 0 || !selectedIssuer) ? 0.5 : 1,
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.5rem',
                  background: 'var(--panel-border)',
                  color: 'var(--text-main)'
                }}
              >
                <CreditCard size={20} />
                Solo Pagar
              </button>

              <button 
                className={`btn-success ${(!selectedIssuer || cart.length === 0) ? 'disabled' : ''}`} 
                onClick={() => handleCheckout(true)}
                disabled={cart.length === 0}
                style={{
                  flex: 2, 
                  opacity: (cart.length === 0 || !selectedIssuer) ? 0.5 : 1,
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.5rem',
                  padding: '12px'
                }}
              >
                <Printer size={20} />
                Pagar e Imprimir
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* --- MODAL DE VISTA PREVIA --- */}
      {showPreviewModal && (() => {
        const issuerData = issuers.find(i => i.id === selectedIssuer);
        return (
          <div className="modal-overlay animate-fade-in">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
              
              {/* Header del Modal */}
              <div className="modal-header" style={{ padding: '1rem 1.5rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Vista Previa de Impresión</span>
                <button onClick={() => setShowPreviewModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
              </div>

              {/* Cuerpo Central (El Ticket) */}
              <div className="modal-body" style={{ background: '#f8fafc', color: '#0f172a', padding: '1.5rem', overflowY: 'auto', maxHeight: '60vh', fontFamily: 'monospace' }}>
                
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #94a3b8', paddingBottom: '1rem', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.2rem', margin: 0, textTransform: 'uppercase', color: '#0f172a' }}>{isNotaVenta ? 'GRAVITY DENIM' : issuerData?.name}</h2>
                  <p style={{ margin: '4px 0', fontSize: '11px', color: '#334155' }}>RUC: {issuerData?.ruc}</p>
                  <p style={{ margin: '4px 0', fontSize: '11px', color: '#334155' }}>Matriz: {issuerData?.direccionMatriz || 'Dirección Matriz'}</p>
                  {!isNotaVenta && <p style={{ margin: '4px 0', fontSize: '11px', color: '#334155' }}>OBLIGADO CONTABILIDAD: {issuerData?.obligadoContabilidad ? 'SI' : 'NO'}</p>}
                  
                  <div style={{ margin: '10px 0', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '6px 0' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>
                      {isNotaVenta ? 'NOTA DE VENTA' : 'FACTURA ELECTRÓNICA'}
                    </div>
                    {isNotaVenta ? (
                      <div style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 'bold', border: '1px dashed #ef4444', padding: '4px', marginTop: '4px', background: '#fef2f2' }}>
                        *** DOCUMENTO SIN VALOR TRIBUTARIO ***
                      </div>
                    ) : (
                      <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                        No. {issuerData?.establecimiento || '001'}-{issuerData?.puntoEmision || '001'}-XXXXXXXXX<br/>
                        <span style={{ fontSize: '9px', color: '#64748b' }}>(Se asignará secuencial al emitir)</span>
                      </div>
                    )}
                    {isNotaVenta && (
                      <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                        No. NV-{issuerData?.establecimiento || '001'}-{issuerData?.puntoEmision || '001'}-XXXXXXXXX<br/>
                        <span style={{ fontSize: '9px', color: '#64748b' }}>(Se asignará secuencial al emitir)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '11px', borderBottom: '1px dashed #94a3b8', paddingBottom: '1rem', marginBottom: '1rem', color: '#334155' }}>
                  <p style={{ margin: '2px 0' }}><b>FECHA:</b> {new Date().toLocaleString('es-EC')}</p>
                  <p style={{ margin: '2px 0' }}><b>CLIENTE:</b> {customer.nombre}</p>
                  <p style={{ margin: '2px 0' }}><b>CI/RUC:</b> {customer.numeroIdentificacion}</p>
                  <p style={{ margin: '2px 0' }}><b>CORREO:</b> {customer.correo}</p>
                  <p style={{ margin: '2px 0' }}><b>DIR:</b> {customer.direccion}</p>
                </div>

                <table style={{ width: '100%', fontSize: '11px', borderBottom: '1px dashed #94a3b8', paddingBottom: '1rem', marginBottom: '1rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #94a3b8', paddingBottom: '4px' }}>CANT</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #94a3b8', paddingBottom: '4px' }}>DESCRIPCION</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #94a3b8', paddingBottom: '4px' }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.id}>
                        <td style={{ paddingTop: '4px', verticalAlign: 'top' }}>{item.qty}</td>
                        <td style={{ paddingTop: '4px', paddingRight: '8px' }}>{item.name}</td>
                        <td style={{ paddingTop: '4px', textAlign: 'right', verticalAlign: 'top' }}>${(item.price * item.qty).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SUB-TOTAL:</span> <span>${subtotal.toFixed(2)}</span></div>
                  {!isNotaVenta && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}><span>BASE IMPONIBLE (15%):</span> <span>${baseImponible.toFixed(2)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}><span>IVA (15%):</span> <span>${ivaAmount.toFixed(2)}</span></div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', fontWeight: 'bold' }}><span>MÉTODO DE PAGO:</span> <span>{paymentMethod}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #0f172a' }}>
                    <span>TOTAL:</span> <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '10px', color: '#64748b' }}>
                  <p>-- Vista previa antes de transmisión --</p>
                </div>
              </div>

              {/* Botones de Acción Formateados */}
              <div className="modal-footer" style={{ padding: '1rem 1.5rem', display: 'flex', gap: '1rem', background: 'var(--panel-bg)' }}>
                <button 
                  onClick={() => setShowPreviewModal(false)}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Regresar
                </button>
                <button 
                  onClick={confirmCheckout}
                  className="btn-success"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flex: 2 }}
                >
                  {checkoutWithPrint && <Printer size={18} />}
                  {checkoutWithPrint ? 'Emitir e Imprimir' : 'Solo Emitir'}
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* --- OVERLAY DE CARGA / PROCESAMIENTO SRI --- */}
      {isProcessing && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 1000, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', border: '1px solid var(--panel-border)', borderRadius: '12px' }}>
            <Loader2 size={48} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.25rem' }}>Procesando Venta</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Firmando el comprobante electrónico y comunicando con el SRI.
              <br/>
              <span style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.5rem', display: 'block', color: 'var(--accent)' }}>
                Por favor, espere unos segundos...
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
