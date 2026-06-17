import React, { useState, useMemo } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Tag, Shirt, UserCircle, Printer, CreditCard, User, Search, Loader2 } from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, setDoc } from 'firebase/firestore';

// Los productos ahora vienen de Firebase/App.js como productsDB

export default function POSScreen({ issuers, productsDB, recordSale, customersDB, recordCustomer }) {
  const [cart, setCart] = useState([]);
  const [vatIncluded, setVatIncluded] = useState(true);
  const [selectedIssuer, setSelectedIssuer] = useState(''); 
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [checkoutWithPrint, setCheckoutWithPrint] = useState(false);

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
      // Búsqueda directa en la colección 'clients' usando el ID del documento
      const docRef = doc(db, 'clients', numeroIdentificacion);
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

    if (vatIncluded) {
      finalTotal = sum;
      base = sum / 1.15;
      iva = finalTotal - base;
    } else {
      base = sum;
      iva = base * 0.15;
      finalTotal = base + iva;
    }

    return { subtotal: sum, baseImponible: base, ivaAmount: iva, total: finalTotal };
  }, [cart, vatIncluded]);


  const imprimirTicketRIDE = (issuerData, cartData, totalsData, customerData, claveAcceso) => {
    console.log("🖨️ [RIDE] Conectando con ticketera térmica 80mm...");
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    
    // Generar las filas de productos
    const productosHTML = cartData.map(item => `
      <tr>
        <td style="padding: 4px 0; vertical-align: top;">${item.qty}</td>
        <td style="padding: 4px 5px; vertical-align: top;">${item.name}</td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top;">$${(item.price * item.qty).toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket RIDE - ${claveAcceso}</title>
        <style>
          @page { margin: 0; }
          body { 
            font-family: monospace; 
            font-size: 12px; 
            margin: 0; 
            padding: 10px; 
            background: white; 
            color: black;
          }
          @media print {
            body { padding: 0; background: white !important; }
            /* Ocultar cualquier elemento del navegador o fondos indeseados */
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          .ticket-container { max-width: 300px; margin: 0 auto; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .mt-2 { margin-top: 8px; }
          .mb-2 { margin-bottom: 8px; }
          .divider { border-top: 1px dashed black; margin: 8px 0; }
          .solid-divider { border-top: 1px solid black; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          th { border-bottom: 1px solid black; padding-bottom: 4px; text-align: left; }
        </style>
      </head>
      <body>
        <div class="ticket-container">
          <div class="text-center mb-2">
            <h2 style="margin:0; font-size: 16px;">${issuerData.name.toUpperCase()}</h2>
            <div class="mt-2">RUC: ${issuerData.ruc}</div>
            <div>DIR: ${issuerData.direccionMatriz || 'N/A'}</div>
            <div>OBLIGADO CONTABILIDAD: ${issuerData.obligadoContabilidad ? 'SI' : 'NO'}</div>
            <div class="font-bold mt-2">GRAVITY DENIM POS</div>
          </div>
          
          <div class="divider"></div>
          
          <div>
            <div><b>CLIENTE:</b> ${customerData.nombre}</div>
            <div><b>CI/RUC:</b> ${customerData.numeroIdentificacion}</div>
            <div><b>CORREO:</b> ${customerData.correo}</div>
            <div><b>DIR:</b> ${customerData.direccion}</div>
            <div><b>TEL:</b> ${customerData.telefono || 'N/A'}</div>
          </div>
          
          <div class="divider"></div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 15%;">CANT</th>
                <th style="width: 60%;">DESCRIPCION</th>
                <th style="width: 25%;" class="text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${productosHTML}
            </tbody>
          </table>
          
          <div class="divider"></div>
          
          <table>
            <tr>
              <td>SUB-TOTAL:</td>
              <td class="text-right">$${totalsData.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td>BASE (15%):</td>
              <td class="text-right">$${totalsData.baseImponible.toFixed(2)}</td>
            </tr>
            <tr>
              <td>IVA 15%:</td>
              <td class="text-right">$${totalsData.ivaAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td class="font-bold" style="padding-top: 4px;">TOTAL:</td>
              <td class="font-bold text-right" style="padding-top: 4px;">$${totalsData.total.toFixed(2)}</td>
            </tr>
          </table>
          
          <div class="solid-divider"></div>
          
          <div class="text-center mt-2">
            <div><b>CLAVE DE ACCESO:</b></div>
            <div style="word-break: break-all; margin-top: 4px; font-size: 11px;">${claveAcceso}</div>
            <div class="mt-2 font-bold">¡Gracias por preferir Gravity Denim!</div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Desencadenar la impresión nativa cuando el contenido esté listo
    printWindow.onload = function() {
      printWindow.focus();
      printWindow.print();
    };
  };

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
    setShowPreviewModal(false);
    const withPrint = checkoutWithPrint;
    const issuerData = issuers.find(i => i.id === selectedIssuer);
    if (!issuerData) return;

    try {
      const totalsData = { subtotal, baseImponible, ivaAmount, total };

      // 0. Guardado Inmediato de Cliente (Antes del SRI y el stock)
      if (customer.tipoDocumento !== 'CONSUMIDOR_FINAL' && customer.numeroIdentificacion) {
        console.log("👤 [Cliente] Guardando/Actualizando cliente en Firebase inmediatamente...");
        try {
          await setDoc(doc(db, "clients", customer.numeroIdentificacion), {
            ...customer,
            fechaTransaccion: new Date().toISOString()
          }, { merge: true });
          console.log("✅ Cliente guardado/actualizado con éxito en la colección 'clients'.");
        } catch (err) {
          console.error("❌ Error guardando cliente:", err);
        }
      }

      // 1. Emitir factura al SRI a través de nuestro backend Next.js
      console.log("🚀 [SRI] Enviando petición a nuestro backend interno...");
      const response = await fetch('/api/sri/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart, customer, vatIncluded, emisorId: issuerData.id })
      });
      
      const sriData = await response.json();
      
      if (!response.ok || !sriData.success) {
        throw new Error(sriData.message || 'La factura fue rechazada o hubo un error de conexión');
      }
      
      const claveAcceso = sriData.claveAcceso;
      
      if (!claveAcceso) {
        throw new Error('El backend no generó una Clave de Acceso válida');
      }

      // 2. Descontar Stock en Firebase
      console.log("📦 [Inventario] Descontando stock en Firebase...");
      for (const item of cart) {
        const dbProduct = productsDB.find(p => p.id === item.id);
        if (dbProduct && dbProduct.stock !== undefined) {
          const newStock = Math.max(0, dbProduct.stock - item.qty);
          await updateDoc(doc(db, 'productos', item.id), { stock: newStock });
          console.log(`   - ${item.name}: -${item.qty} unidades. Nuevo stock: ${newStock}`);
        }
      }

      // (La lógica de guardado de cliente fue trasladada al paso 0, al inicio de confirmCheckout)
      // 3. Imprimir si corresponde
      if (withPrint) {
        imprimirTicketRIDE(issuerData, cart, totalsData, customer, claveAcceso);
      } else {
        console.log("🖨️ [RIDE] Impresión física omitida por el operador.");
      }

      // 4. Guardar Cliente y Venta
      recordCustomer(customer);
      console.log(`💾 [Clientes] Cliente ${customer.nombre} guardado/actualizado en base de datos.`);

      const saleRecord = {
        id: claveAcceso, // Usamos la Clave de Acceso del SRI como identificador único
        issuerId: selectedIssuer,
        issuerName: issuerData.name,
        date: new Date(),
        customer: customer,
        items: cart,
        totals: totalsData,
        claveAcceso
      };
      await recordSale(saleRecord);

      alert(`Venta guardada exitosamente por ${issuerData.name}\n${withPrint ? 'Ticket enviado a la impresora.' : 'Sin impresión física.'}`);
      
      // 5. Limpiar carrito y resetear form con retraso para asegurar impresión térmica
      setTimeout(() => {
        setCart([]);
        setCustomer({
          tipoDocumento: 'CEDULA',
          numeroIdentificacion: '',
          nombre: '',
          correo: '',
          direccion: '',
          telefono: ''
        });
      }, 500);
    } catch (error) {
      alert(`⚠️ Ocurrió un error en el pago: ${error.message}`);
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
    background: 'rgba(0,0,0,0.2)',
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
              className={selectedIssuer ? 'selected text-white bg-slate-800' : 'unselected text-white bg-slate-800'}
            >
              <option className="bg-slate-800 text-white" value="" disabled>-- Seleccione Emisor (Hermano) --</option>
              {issuers.map(issuer => (
                <option className="bg-slate-800 text-white" key={issuer.id} value={issuer.id}>{issuer.name} (RUC: {issuer.ruc.slice(-4)})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="products-grid">
          {productsDB.map((prod) => (
            <div key={prod.id} className="product-card" onClick={() => addToCart(prod)}>
              <div className="product-icon">{prod.categoria === 'Jeans' ? <Shirt size={32}/> : <Tag size={32}/>}</div>
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
                      style={{width: '70px', padding: '4px', textAlign: 'right', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '4px', color: 'white'}}
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
                    style={{...inputStyle, color: 'white'}} 
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
                    style={{...inputStyle, color: 'white'}} 
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
                    style={{...inputStyle, color: 'white'}} 
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
                    style={{...inputStyle, color: 'white'}} 
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
                    style={{...inputStyle, color: 'white'}} 
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

      {/* --- MODAL DE VISTA PREVIA (Tirilla 80mm) --- */}
      {showPreviewModal && (() => {
        const issuerData = issuers.find(i => i.id === selectedIssuer);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4 animate-fade-in">
            {/* Contenedor Principal */}
            <div className="flex flex-col max-h-[85vh] w-full max-w-md bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700">
              
              {/* Header del Modal */}
              <div className="bg-slate-900 text-white p-4 text-center font-bold text-lg flex justify-between items-center border-b border-slate-800">
                <span>Vista Previa (80mm)</span>
                <button onClick={() => setShowPreviewModal(false)} className="text-gray-400 hover:text-white">&times;</button>
              </div>

              {/* Cuerpo Central con Scroll */}
              <div className="flex-1 overflow-y-auto p-4 bg-slate-950">
                <div className="bg-white text-black p-4 rounded" style={{ fontFamily: 'monospace' }}>
                  {/* Encabezado Emisor */}
                  <div className="text-center mb-4 border-b border-dashed border-gray-400 pb-4">
                    <h2 className="text-xl font-bold uppercase">{issuerData?.name}</h2>
                    <p className="text-sm">RUC: {issuerData?.ruc}</p>
                    <p className="text-xs mt-1">{issuerData?.direccionMatriz || 'Dirección Matriz'}</p>
                    <p className="text-xs mt-1">OBLIGADO A LLEVAR CONTABILIDAD: {issuerData?.obligadoContabilidad ? 'SI' : 'NO'}</p>
                    <p className="text-sm font-bold mt-2">GRAVITY DENIM POS</p>
                  </div>

                  {/* Datos del Cliente */}
                  <div className="mb-4 text-xs space-y-1 border-b border-dashed border-gray-400 pb-4">
                    <p><span className="font-bold">CLIENTE:</span> {customer.nombre}</p>
                    <p><span className="font-bold">CI/RUC:</span> {customer.numeroIdentificacion}</p>
                    <p><span className="font-bold">CORREO:</span> {customer.correo}</p>
                    <p><span className="font-bold">DIR:</span> {customer.direccion}</p>
                  </div>

                  {/* Tabla de Productos */}
                  <div className="mb-4 text-xs border-b border-dashed border-gray-400 pb-4">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-300">
                          <th className="py-1">CANT</th>
                          <th className="py-1">DESCRIPCION</th>
                          <th className="py-1 text-right">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map(item => (
                          <tr key={item.id}>
                            <td className="py-1 align-top">{item.qty}</td>
                            <td className="py-1 pr-2">{item.name}</td>
                            <td className="py-1 text-right align-top">${(item.price * item.qty).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totales y Desglose de IVA */}
                  <div className="text-sm space-y-1 text-right">
                    <p className="flex justify-between"><span>SUB-TOTAL:</span> <span>${subtotal.toFixed(2)}</span></p>
                    <p className="flex justify-between text-gray-600 text-xs"><span>BASE IMPONIBLE (15%):</span> <span>${baseImponible.toFixed(2)}</span></p>
                    <p className="flex justify-between text-gray-600 text-xs"><span>IVA (15%):</span> <span>${ivaAmount.toFixed(2)}</span></p>
                    <p className="flex justify-between font-bold text-lg mt-2 border-t border-black pt-2">
                      <span>TOTAL NETO:</span> <span>${total.toFixed(2)}</span>
                    </p>
                  </div>

                  <div className="text-center mt-6 text-xs text-gray-500">
                    <p>-- Vista previa antes de transmisión SRI --</p>
                  </div>
                </div>
              </div>

              {/* Barra de Botones Fija Inferior */}
              <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-3 sticky bottom-0">
                <button 
                  onClick={() => setShowPreviewModal(false)}
                  className="w-1/3 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Regresar
                </button>
                <button 
                  onClick={confirmCheckout}
                  className="w-2/3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Printer size={18} />
                  🚀 Confirmar y Emitir al SRI
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
