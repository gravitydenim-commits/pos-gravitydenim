import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Tag, Shirt, UserCircle, Printer, CreditCard, User, Search, Loader2, ShoppingBag, Scissors, Package, Briefcase, Glasses, Watch, Gem } from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, setDoc, onSnapshot } from 'firebase/firestore';

// Los productos ahora vienen de Firebase/App.js como productsDB

export default function POSScreen({ issuers, productsDB, salesDB = [], recordSale, customersDB, recordCustomer }) {
  const [cart, setCart] = useState([]);
  const [vatIncluded, setVatIncluded] = useState(true);
  const [selectedIssuer, setSelectedIssuer] = useState(''); 
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [checkoutWithPrint, setCheckoutWithPrint] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [transferRecipient, setTransferRecipient] = useState('');
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
    setCustomer(prev => ({ ...prev, [name]: value }));
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
    const { numeroIdentificacion } = customer;
    if (!numeroIdentificacion || numeroIdentificacion.length < 10) return;
    if (customer.tipoDocumento === 'CONSUMIDOR_FINAL') return;

    setIsSearchingClient(true);
    console.log(`🔍 Buscando cliente con CI/RUC: ${numeroIdentificacion}...`);

    try {
      // Búsqueda directa en la colección 'clientes' usando el ID del documento
      const docRef = doc(db, 'clientes', numeroIdentificacion);
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
    setCart((prev) => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }));
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

  // --- MATH / VAT LOGIC ---
  const { subtotal, baseImponible, ivaAmount, total } = useMemo(() => {
    const sum = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    let base = 0;
    let iva = 0;
    let finalTotal = 0;

    if (isNotaVenta) {
      base = sum;
      iva = 0;
      finalTotal = sum;
    } else if (vatIncluded) {
      finalTotal = sum;
      base = sum / 1.15;
      iva = finalTotal - base;
    } else {
      base = sum;
      iva = base * 0.15;
      finalTotal = base + iva;
    }

    return { subtotal: sum, baseImponible: base, ivaAmount: iva, total: finalTotal };
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

    setCheckoutWithPrint(withPrint);
    setShowPreviewModal(true);
  };

  // --- CONFIRMAR PAGO REAL (SRI Y FIREBASE) ---
  const confirmCheckout = async () => {
    if (isProcessing) return; // Bloqueo anti doble clic
    if (paymentMethod === 'TRANSFERENCIA' && !transferRecipient) {
      alert("⚠️ DEBES SELECCIONAR A QUIÉN SE REALIZÓ LA TRANSFERENCIA (Edgar, Amparito, Junior, Diana).");
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
          isNotaVenta: isNotaVenta,
          transferRecipient: paymentMethod === 'TRANSFERENCIA' ? transferRecipient : null
        })
      });
      
      let sriData = {};
      try {
        sriData = await response.json();
      } catch (e) {
        throw new Error('El servidor no respondió correctamente.');
      }
      
      const claveAcceso = sriData.claveAcceso || `FALLBACK-${Date.now()}`;
      const estadoFactura = sriData.estado;
      
      if (!response.ok) {
         throw new Error(sriData.error || sriData.message || 'Error en el servidor al procesar la venta.');
      }

      if (estadoFactura === 'CONTINGENCIA_LOCAL') {
        alert(`⚠️ Sin conexión con el SRI. La factura se guardó internamente y se emitirá automáticamente cuando regrese el internet.\nClave temporal: ${claveAcceso}`);
      } else if (estadoFactura === 'RECHAZADO') {
        throw new Error(sriData.error || sriData.message || 'La factura fue rechazada por el servidor SRI.');
      }

      // (La lógica de guardado de cliente fue trasladada al paso 0, al inicio de confirmCheckout)
      // La lógica de Stock y Guardado de Venta fue movida al Backend (emitir.js) 
      // para evitar duplicaciones y ser parte del commit atómico del SRI.

      // 3. Imprimir si corresponde
      if (withPrint) {
        import('../../utils/printTicket').then(module => {
          const format = localStorage.getItem('printerFormat') || '80mm';
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
          {sortedProducts.map((prod) => (
            <div key={prod.id} className="product-card" onClick={() => addToCart(prod)}>
              <div className="product-icon">
                {(() => {
                  if (prod.icono) {
                    if (prod.icono === 'Shirt') return <Shirt size={32}/>;
                    if (prod.icono === 'ShoppingBag') return <ShoppingBag size={32}/>;
                    if (prod.icono === 'Tag') return <Tag size={32}/>;
                    if (prod.icono === 'Scissors') return <Scissors size={32}/>;
                    if (prod.icono === 'Package') return <Package size={32}/>;
                    if (prod.icono === 'Briefcase') return <Briefcase size={32}/>;
                    if (prod.icono === 'Glasses') return <Glasses size={32}/>;
                    if (prod.icono === 'Watch') return <Watch size={32}/>;
                    if (prod.icono === 'Gem') return <Gem size={32}/>;
                    // Si no es ninguno de los anteriores, asumimos que es un emoji
                    return <span style={{ fontSize: '32px', lineHeight: 1 }}>{prod.icono}</span>;
                  }
                  
                  // Fallback para productos antiguos
                  const cat = (prod.categoria || '').toLowerCase();
                  if (cat.includes('jeans')) return <Shirt size={32}/>;
                  if (cat.includes('chaqueta')) return <ShoppingBag size={32}/>;
                  if (cat.includes('camisa')) return <Shirt size={32}/>;
                  if (cat.includes('accesorio')) return <Tag size={32}/>;
                  if (cat.includes('sastreria') || cat.includes('costura')) return <Scissors size={32}/>;
                  return <Package size={32}/>;
                })()}
              </div>
              <div className="product-name">{prod.nombre || prod.name}</div>
              <div className="product-price">${(prod.precioBase || prod.price || 0).toFixed(2)}</div>
            </div>
          ))}
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
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem'}}>
                    <input 
                      type="number" 
                      value={item.price === 0 ? '' : item.price} 
                      onChange={(e) => updateCustomPrice(item.id, e.target.value)}
                      style={{width: '70px', padding: '4px', textAlign: 'right', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '4px', color: 'var(--text-main)'}}
                      step="0.01"
                    />
                    <span style={{color: 'var(--text-muted)', fontSize: '0.8rem'}}>c/u</span>
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
              <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Destinatario de la Transferencia:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {['Edgar', 'Amparito', 'Junior', 'Diana'].map((name) => (
                    <button
                      key={name}
                      onClick={() => setTransferRecipient(name)}
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        border: `1px solid ${transferRecipient === name ? '#3b82f6' : 'var(--panel-border)'}`,
                        background: transferRecipient === name ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                        color: transferRecipient === name ? '#3b82f6' : 'var(--text-main)',
                        fontWeight: transferRecipient === name ? 'bold' : 'normal',
                        cursor: 'pointer'
                      }}
                    >
                      {name}
                    </button>
                  ))}
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
                  <h2 style={{ fontSize: '1.2rem', margin: 0, textTransform: 'uppercase' }}>{issuerData?.name}</h2>
                  <p style={{ margin: '4px 0' }}>RUC: {issuerData?.ruc}</p>
                  <p style={{ margin: '4px 0', fontSize: '11px' }}>{issuerData?.direccionMatriz || 'Dirección Matriz'}</p>
                  <p style={{ margin: '4px 0', fontSize: '11px' }}>OBLIGADO CONTABILIDAD: {issuerData?.obligadoContabilidad ? 'SI' : 'NO'}</p>
                  <p style={{ fontWeight: 'bold', marginTop: '8px' }}>GRAVITY DENIM POS</p>
                </div>

                <div style={{ fontSize: '11px', borderBottom: '1px dashed #94a3b8', paddingBottom: '1rem', marginBottom: '1rem' }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}><span>BASE IMPONIBLE (15%):</span> <span>${baseImponible.toFixed(2)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}><span>IVA (15%):</span> <span>${ivaAmount.toFixed(2)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', fontWeight: 'bold' }}><span>MÉTODO DE PAGO:</span> <span>{paymentMethod}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #0f172a' }}>
                    <span>TOTAL NETO:</span> <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '10px', color: '#64748b' }}>
                  <p>-- Vista previa antes de transmisión SRI --</p>
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
    </div>
  );
}
