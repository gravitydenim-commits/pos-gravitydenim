"use client";
import React, { useState, useEffect } from 'react';
import '../../src/index.css';

export default function PantallaCliente() {
  const [csState, setCsState] = useState({
    status: 'idle', // 'idle' | 'customer_review' | 'checkout' | 'paid' | 'cart_view'
    customerData: null,
    total: 0,
    paymentMethod: 'EFECTIVO'
  });

  const [settings, setSettings] = useState({
    enabled: true,
    welcomeType: 'logo_msg',
    message: 'Bienvenidos a Gravity Denim',
    showTotal: true,
    showQR: true
  });

  // Cargar configuración inicial
  useEffect(() => {
    const loadSettings = () => {
      const isAndroidBridge = typeof window !== 'undefined' && Boolean(window.AndroidBridge);
      setSettings({
        enabled: isAndroidBridge || localStorage.getItem('csEnabled') !== 'false',
        welcomeType: localStorage.getItem('csWelcomeType') || 'logo_msg',
        message: localStorage.getItem('csMessage') || 'Bienvenidos a Gravity Denim',
        showTotal: localStorage.getItem('csShowTotal') !== 'false',
        showQR: localStorage.getItem('csShowQR') !== 'false'
      });
    };

    loadSettings();

    const handleStorage = (e) => {
      if (e.key && e.key.startsWith('cs')) {
        loadSettings();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Escuchar eventos globales de BroadcastChannel y puente AndroidBridge
  useEffect(() => {
    const channel = new BroadcastChannel('gravity_pos_channel');
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'STATE_UPDATE') {
        setCsState(event.data.payload);
      }
    };

    // Callback para puente nativo AndroidBridge
    if (typeof window !== 'undefined') {
      window.onCustomerScreenUpdate = (payload) => {
        if (payload) setCsState(payload);
      };
    }

    return () => channel.close();
  }, []);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  if (!settings.enabled) {
    return (
      <div style={{ height: '100dvh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '1rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Pantalla secundaria deshabilitada en configuración.</p>
      </div>
    );
  }

  // 1. Customer Review Mode (Revisión de Datos del Cliente)
  if (csState.status === 'customer_review') {
    const cData = csState.customerData || {};
    return (
      <div style={{ minHeight: '100dvh', height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#0f172a', color: 'white', padding: '1rem', boxSizing: 'border-box', overflowY: 'auto' }}>
        {/* Cabecera Adaptable */}
        <div style={{ textAlign: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
          <img src="/logo.jpg" alt="Logo" style={{ height: 'clamp(35px, 6vh, 50px)', marginBottom: '0.5rem', borderRadius: '8px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
          <h1 style={{ fontSize: 'clamp(1.4rem, 4vw, 2.2rem)', fontWeight: 'bold', color: '#38bdf8', margin: '0 0 0.25rem 0', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Por favor, revise sus datos
          </h1>
          <p style={{ fontSize: 'clamp(0.85rem, 2.2vw, 1.1rem)', color: '#94a3b8', margin: 0, fontWeight: '400' }}>
            Indique al vendedor si necesita corregir alguna información.
          </p>
        </div>

        {/* Tarjeta de Confirmación Adaptable */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <div style={{ 
            width: '100%', 
            maxWidth: '750px', 
            background: 'rgba(30, 41, 59, 0.95)', 
            borderRadius: '16px', 
            border: '1.5px solid rgba(56, 189, 248, 0.4)', 
            padding: '1.25rem', 
            boxShadow: '0 15px 35px rgba(0,0,0,0.5)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              
              {/* Nombres / Razón Social */}
              <div style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,0.04)', padding: '0.85rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                  Nombres / Razón Social
                </span>
                <span style={{ fontSize: 'clamp(1.1rem, 2.8vw, 1.6rem)', fontWeight: 'bold', color: '#ffffff', wordBreak: 'break-word', lineHeight: 1.2 }}>
                  {cData.nombre || '—'}
                </span>
              </div>

              {/* Cédula o RUC */}
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                  {cData.tipoDocumento === 'RUC' ? 'RUC' : cData.tipoDocumento === 'CEDULA' ? 'Cédula' : 'Identificación'}
                </span>
                <span style={{ fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', fontWeight: 'bold', color: '#38bdf8' }}>
                  {cData.numeroIdentificacion || '—'}
                </span>
              </div>

              {/* Teléfono */}
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                  Teléfono
                </span>
                <span style={{ fontSize: 'clamp(0.95rem, 2.2vw, 1.3rem)', color: '#ffffff', fontWeight: '500' }}>
                  {cData.telefono || '—'}
                </span>
              </div>

              {/* Dirección */}
              <div style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,0.04)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                  Dirección
                </span>
                <span style={{ fontSize: 'clamp(0.95rem, 2.2vw, 1.2rem)', color: '#ffffff', wordBreak: 'break-word', fontWeight: '500', lineHeight: 1.2 }}>
                  {cData.direccion || '—'}
                </span>
              </div>

              {/* Correo electrónico */}
              <div style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,0.04)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                  Correo Electrónico
                </span>
                <span style={{ fontSize: 'clamp(0.95rem, 2.2vw, 1.2rem)', color: '#ffffff', wordBreak: 'break-word', fontWeight: '500', lineHeight: 1.2 }}>
                  {cData.correo || '—'}
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Standby / Paid view
  if (csState.status === 'idle' || csState.status === 'paid') {
    return (
      <div style={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', textAlign: 'center', padding: '1rem', boxSizing: 'border-box' }}>
        {csState.status === 'paid' && (
          <div style={{ marginBottom: '1.25rem', animation: 'fadeIn 0.5s ease-out' }}>
            <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', color: 'var(--success)', margin: '0 0 0.5rem 0' }}>¡Gracias por preferirnos!</h1>
            <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', color: 'var(--text-muted)', margin: 0 }}>Tu pago ha sido procesado exitosamente.</p>
          </div>
        )}

        {(settings.welcomeType === 'logo_msg' || settings.welcomeType === 'logo_only') && (
          <img 
            src="/logo.jpg" 
            alt="Logo" 
            style={{ width: 'clamp(140px, 30vw, 220px)', maxWidth: '70%', marginBottom: '1.25rem', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', objectFit: 'contain' }} 
            onError={(e) => e.target.style.display = 'none'}
          />
        )}
        
        {(settings.welcomeType === 'logo_msg' || settings.welcomeType === 'msg_only') && (
          <h2 style={{ fontSize: 'clamp(1.3rem, 3.8vw, 2.2rem)', fontWeight: 'bold', color: 'var(--accent)', margin: 0, textShadow: '0 2px 10px rgba(59, 130, 246, 0.3)' }}>
            {settings.message}
          </h2>
        )}
      </div>
    );
  }

  // 3. Checkout view (Momento del cobro)
  if (csState.status === 'checkout') {
    return (
      <div style={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#0f172a', color: 'white', padding: '1rem', boxSizing: 'border-box', overflowY: 'auto' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          <img src="/logo.jpg" alt="Logo" style={{ height: 'clamp(35px, 6vh, 50px)', marginBottom: '1rem', borderRadius: '8px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
          
          {settings.showTotal ? (
            <div style={{ background: 'rgba(30, 41, 59, 0.95)', padding: '1.5rem 2.5rem', borderRadius: '20px', border: '1px solid var(--panel-border)', textAlign: 'center', boxShadow: '0 15px 35px rgba(0,0,0,0.5)' }}>
              <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.3rem)', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>Total a Cancelar</p>
              <h1 style={{ fontSize: 'clamp(2.8rem, 8vw, 4.8rem)', margin: 0, color: 'var(--success)', fontWeight: 'bold', textShadow: '0 0 15px rgba(34, 197, 94, 0.4)', lineHeight: 1.1 }}>
                {formatCurrency(csState.total)}
              </h1>
              
              <div style={{ marginTop: '1rem', display: 'inline-block', padding: '6px 18px', background: 'var(--panel-bg)', borderRadius: '99px', border: '1px solid var(--panel-border)', fontSize: 'clamp(0.9rem, 2vw, 1.1rem)', color: 'var(--text-main)' }}>
                {csState.paymentMethod === 'TRANSFERENCIA' ? '🏦 Pago por Transferencia' : '💵 Pago en Efectivo'}
              </div>
            </div>
          ) : (
             <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', color: 'var(--text-main)' }}>Procesando cobro...</h2>
          )}

          {settings.showQR && csState.paymentMethod === 'TRANSFERENCIA' && (
            <div style={{ marginTop: '1.25rem', textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: 'clamp(0.9rem, 2vw, 1.1rem)' }}>
                {csState.transferRecipient 
                  ? `Escanea para transferir a ${csState.transferRecipient}:` 
                  : 'Escanea para transferir:'}
              </p>
              <div style={{ background: 'white', padding: '0.75rem', borderRadius: '12px', display: 'inline-block' }}>
                {csState.qrUrl ? (
                  <img src={csState.qrUrl} alt="QR Transferencia" style={{ width: 'clamp(120px, 20vw, 160px)', height: 'clamp(120px, 20vw, 160px)', objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: 'clamp(120px, 20vw, 160px)', height: 'clamp(120px, 20vw, 160px)', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', borderRadius: '8px', border: '2px dashed #94a3b8', padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem' }}>
                    {csState.transferRecipient ? `No hay QR configurado para ${csState.transferRecipient}` : 'Seleccione destinatario en el POS'}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  // 4. Cart View Mode (Visualización de productos del carrito)
  if (csState.status === 'cart_view') {
    const items = csState.cartItems || [];
    return (
      <div style={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#0f172a', color: 'white', overflow: 'hidden', boxSizing: 'border-box' }}>
        {/* Cabecera compacta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/logo.jpg" alt="Logo" style={{ height: '32px', borderRadius: '4px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
            <h1 style={{ fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', fontWeight: 'bold', color: '#38bdf8', margin: 0 }}>Su Compra</h1>
          </div>
          <span style={{ fontSize: '1rem', color: '#94a3b8' }}>Gravity Denim POS</span>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Tabla de Productos (Izquierda) */}
          <div style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '1.1rem' }}>
                Esperando productos...
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: '#38bdf8', fontSize: '0.95rem' }}>Descripción</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: '#38bdf8', fontSize: '0.95rem', width: '70px' }}>Cant</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', color: '#38bdf8', fontSize: '0.95rem', width: '90px' }}>P. Unit</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', color: '#38bdf8', fontSize: '0.95rem', width: '100px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const qty = item.qty || item.cantidad || 1;
                    const price = item.price || item.precio || 0;
                    const desc = item.descuento || 0;
                    const totalLine = (qty * price) - desc;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.95rem' }}>
                        <td style={{ padding: '0.5rem', fontWeight: '500' }}>
                          {item.name || item.nombre}
                          {desc > 0 && (
                            <div style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.1rem' }}>
                              Descuento: -{formatCurrency(desc)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold' }}>{qty}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(price)}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#38bdf8' }}>{formatCurrency(totalLine)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Resumen de Totales (Derecha) */}
          <div style={{ width: '280px', background: 'rgba(30, 41, 59, 0.7)', borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', color: '#38bdf8', marginBottom: '1rem', marginTop: 0 }}>Resumen</h2>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                <span style={{ color: '#94a3b8' }}>Subtotal:</span>
                <span>{formatCurrency(csState.subtotal)}</span>
              </div>
              {csState.totalDescuentos > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.95rem', color: '#f87171' }}>
                  <span>Descuentos:</span>
                  <span>-{formatCurrency(csState.totalDescuentos)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.95rem' }}>
                <span style={{ color: '#94a3b8' }}>IVA 15%:</span>
                <span>{formatCurrency(csState.ivaAmount)}</span>
              </div>
            </div>

            <div style={{ borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.1rem', color: '#38bdf8', fontWeight: 'bold' }}>Total:</span>
                <span style={{ fontSize: '1.8rem', color: '#22c55e', fontWeight: 'bold', textShadow: '0 0 10px rgba(34, 197, 94, 0.2)' }}>
                  {formatCurrency(csState.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
