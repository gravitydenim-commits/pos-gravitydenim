"use client";
import React, { useState, useEffect } from 'react';
import '../../src/index.css';

export default function PantallaCliente() {
  const [csState, setCsState] = useState({
    status: 'idle', // 'idle' | 'customer_review' | 'checkout' | 'paid' | 'cart_view'
    customerData: null,
    total: 0,
    paymentMethod: 'EFECTIVO',
    cartItems: [],
    subtotal: 0,
    totalDescuentos: 0,
    ivaAmount: 0,
    transferRecipient: '',
    qrUrl: ''
  });

  const [settings, setSettings] = useState({
    enabled: true,
    welcomeType: 'logo_msg',
    message: 'Bienvenidos a Gravity Denim',
    showTotal: true,
    showQR: true
  });

  const [scale, setScale] = useState(1);

  // Proportional scaling calculator for secondary display (22cm x 13.5cm -> ~1.63 aspect ratio)
  useEffect(() => {
    const handleResize = () => {
      const baseWidth = 800;
      const baseHeight = 490;
      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight;
      
      const scaleX = winWidth / baseWidth;
      const scaleY = winHeight / baseHeight;
      // Scale down or up to fit completely within the screen boundary
      setScale(Math.min(scaleX, scaleY));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        if (payload) {
          try {
            // Si el payload llega como string JSON (puente nativo antiguo), lo parseamos
            const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
            setCsState(parsed);
          } catch (e) {
            console.error("Error al parsear update pantalla cliente:", e);
          }
        }
      };
    }

    return () => channel.close();
  }, []);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  const getCustomerNameFontSize = (name) => {
    if (!name) return '24px';
    const len = name.length;
    if (len > 50) return '14px';
    if (len > 35) return '17px';
    if (len > 22) return '20px';
    return '24px';
  };

  const getProductNameFontSize = (name) => {
    if (!name) return '14px';
    const len = name.length;
    if (len > 40) return '10px';
    if (len > 25) return '12px';
    return '14px';
  };

  if (!settings.enabled) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '1rem' }}>
        <p style={{ color: '#64748b', fontSize: '1rem' }}>Pantalla secundaria deshabilitada en configuración.</p>
      </div>
    );
  }

  const renderContent = () => {
    // 1. Customer Review Mode (Revisión de Datos del Cliente)
    if (csState.status === 'customer_review') {
      const cData = csState.customerData || {};
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a', color: 'white', padding: '15px', boxSizing: 'border-box', overflow: 'hidden' }}>
          {/* Cabecera compacta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '10px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/logo.jpg" alt="Logo" style={{ height: '36px', borderRadius: '6px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
              <div>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8', margin: 0, lineHeight: 1.1 }}>
                  Confirme sus Datos de Facturación
                </h1>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                  Por favor verifique que la información sea correcta
                </p>
              </div>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', background: 'rgba(56, 189, 248, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>GRAVITY DENIM</span>
          </div>

          {/* Grid de Datos del Cliente */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', minHeight: 0 }}>
            {/* Nombres / Razón Social */}
            <div style={{ gridColumn: '1 / -1', background: 'rgba(30, 41, 59, 0.7)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '2px' }}>
                Nombres / Razón Social
              </span>
              <span style={{ fontSize: getCustomerNameFontSize(cData.nombre), fontWeight: 'bold', color: '#ffffff', wordBreak: 'break-word', lineHeight: 1.1 }}>
                {cData.nombre || '—'}
              </span>
            </div>

            {/* Cédula o RUC */}
            <div style={{ background: 'rgba(30, 41, 59, 0.7)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '2px' }}>
                {cData.tipoDocumento === 'RUC' ? 'RUC' : cData.tipoDocumento === 'CEDULA' ? 'Cédula' : 'Identificación'}
              </span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8' }}>
                {cData.numeroIdentificacion || '—'}
              </span>
            </div>

            {/* Teléfono */}
            <div style={{ background: 'rgba(30, 41, 59, 0.7)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '2px' }}>
                Teléfono
              </span>
              <span style={{ fontSize: '17px', color: '#ffffff', fontWeight: 'bold' }}>
                {cData.telefono || '—'}
              </span>
            </div>

            {/* Dirección */}
            <div style={{ gridColumn: '1 / -1', background: 'rgba(30, 41, 59, 0.7)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '2px' }}>
                Dirección
              </span>
              <span style={{ fontSize: '14px', color: '#ffffff', wordBreak: 'break-word', fontWeight: '500', lineHeight: 1.1 }}>
                {cData.direccion || '—'}
              </span>
            </div>

            {/* Correo electrónico */}
            <div style={{ gridColumn: '1 / -1', background: 'rgba(30, 41, 59, 0.7)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 'bold', marginBottom: '2px' }}>
                Correo Electrónico
              </span>
              <span style={{ fontSize: '14px', color: '#ffffff', wordBreak: 'break-word', fontWeight: '500', lineHeight: 1.1 }}>
                {cData.correo || '—'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // 2. Standby / Paid view / Cart view
    if (csState.status === 'idle' || csState.status === 'paid' || csState.status === 'cart_view') {
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', textAlign: 'center', padding: '20px', boxSizing: 'border-box' }}>
          {csState.status === 'paid' && (
            <div style={{ marginBottom: '15px' }}>
              <h1 style={{ fontSize: '32px', color: '#22c55e', margin: '0 0 4px 0', fontWeight: 'bold' }}>¡Gracias por preferirnos!</h1>
              <p style={{ fontSize: '16px', color: '#94a3b8', margin: 0 }}>Tu pago ha sido procesado exitosamente.</p>
            </div>
          )}

          {(settings.welcomeType === 'logo_msg' || settings.welcomeType === 'logo_only') && (
            <img 
              src="/logo.jpg" 
              alt="Logo" 
              style={{ width: '130px', height: '130px', marginBottom: '15px', borderRadius: '50%', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', objectFit: 'cover', border: '3px solid rgba(56, 189, 248, 0.3)' }} 
              onError={(e) => e.target.style.display = 'none'}
            />
          )}
          
          {(settings.welcomeType === 'logo_msg' || settings.welcomeType === 'msg_only') && (
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#38bdf8', margin: 0, textShadow: '0 2px 10px rgba(59, 130, 246, 0.3)' }}>
              {settings.message}
            </h2>
          )}
        </div>
      );
    }

    // 3. Checkout view (Momento del cobro)
    if (csState.status === 'checkout') {
      const isTransfer = csState.paymentMethod === 'TRANSFERENCIA';
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a', color: 'white', padding: '15px', boxSizing: 'border-box', overflow: 'hidden' }}>
          {/* Cabecera compacta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '15px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/logo.jpg" alt="Logo" style={{ height: '36px', borderRadius: '6px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8', margin: 0 }}>Procesar Pago</h1>
            </div>
            <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 'bold', background: 'rgba(34, 197, 94, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>GRAVITY DENIM</span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: 0 }}>
            {/* Caja de Total (Izquierda) */}
            <div style={{ 
              flex: 1, 
              background: 'rgba(30, 41, 59, 0.95)', 
              padding: '20px', 
              borderRadius: '16px', 
              border: '1.5px solid rgba(56, 189, 248, 0.2)', 
              textAlign: 'center', 
              boxShadow: '0 15px 35px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              height: '100%',
              boxSizing: 'border-box'
            }}>
              <p style={{ fontSize: '15px', color: '#94a3b8', margin: '0 0 5px 0' }}>Total a Cancelar</p>
              <h1 style={{ fontSize: '46px', margin: '0 0 10px 0', color: '#22c55e', fontWeight: 'bold', textShadow: '0 0 15px rgba(34, 197, 94, 0.4)', lineHeight: 1.1 }}>
                {formatCurrency(csState.total)}
              </h1>
              
              <div style={{ alignSelf: 'center', padding: '6px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1' }}>
                {isTransfer ? '🏦 Transferencia Bancaria' : '💵 Pago en Efectivo'}
              </div>
            </div>

            {/* QR de Transferencia (Derecha - Solo si aplica) */}
            {isTransfer && settings.showQR && (
              <div style={{ 
                width: '320px', 
                height: '100%', 
                background: 'rgba(30, 41, 59, 0.5)', 
                borderRadius: '16px', 
                border: '1px solid rgba(255,255,255,0.06)', 
                padding: '12px', 
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <p style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', margin: '0 0 8px 0', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {csState.transferRecipient 
                    ? `Escanea QR para transferir a:` 
                    : 'Escanea para transferir:'}
                </p>
                {csState.transferRecipient && (
                  <p style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 'bold', margin: '0 0 8px 0', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {csState.transferRecipient}
                  </p>
                )}
                <div style={{ background: 'white', padding: '6px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {csState.qrUrl ? (
                    <img src={csState.qrUrl} alt="QR Transferencia" style={{ width: '130px', height: '130px', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ width: '130px', height: '130px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', borderRadius: '6px', border: '1.5px dashed #cbd5e1', padding: '8px', textAlign: 'center', fontSize: '10px', boxSizing: 'border-box' }}>
                      {csState.transferRecipient ? 'Sin QR configurado' : 'Selecciona destinatario en POS'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }



    return null;
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <div style={{
        width: '800px',
        height: '490px',
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        flexShrink: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        {renderContent()}
      </div>
    </div>
  );
}
