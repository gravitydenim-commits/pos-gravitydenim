"use client";
import React, { useState, useEffect } from 'react';
import '../../src/index.css';

export default function PantallaCliente() {
  const [csState, setCsState] = useState({
    status: 'idle', // 'idle' | 'checkout' | 'paid'
    total: 0,
    paymentMethod: 'EFECTIVO'
  });

  const [settings, setSettings] = useState({
    enabled: false,
    welcomeType: 'logo_msg',
    message: 'Bienvenidos a Gravity Denim',
    showTotal: true,
    showQR: true
  });

  // Load initial settings and listen to localStorage changes (for settings)
  useEffect(() => {
    const loadSettings = () => {
      setSettings({
        enabled: localStorage.getItem('csEnabled') === 'true',
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

  // Listen to BroadcastChannel for real-time POS events
  useEffect(() => {
    const channel = new BroadcastChannel('gravity_pos_channel');
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'STATE_UPDATE') {
        setCsState(event.data.payload);
      }
    };
    return () => channel.close();
  }, []);

  // Format currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  // --- RENDER LOGIC ---

  if (!settings.enabled) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
        <p style={{ color: 'var(--text-muted)' }}>Pantalla secundaria deshabilitada en configuración.</p>
      </div>
    );
  }

  // 1. Idle (or Paid) view
  if (csState.status === 'idle' || csState.status === 'paid') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', textAlign: 'center', padding: '2rem' }}>
        {csState.status === 'paid' && (
          <div style={{ marginBottom: '2rem', animation: 'fadeIn 0.5s ease-out' }}>
            <h1 style={{ fontSize: '3rem', color: 'var(--success)' }}>¡Gracias por preferirnos!</h1>
            <p style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>Tu pago ha sido procesado exitosamente.</p>
          </div>
        )}

        {(settings.welcomeType === 'logo_msg' || settings.welcomeType === 'logo_only') && (
          <img 
            src="/logo.jpg" 
            alt="Logo" 
            style={{ width: '300px', maxWidth: '80%', marginBottom: '2rem', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', transition: 'all 0.3s' }} 
            onError={(e) => e.target.style.display = 'none'}
          />
        )}
        
        {(settings.welcomeType === 'logo_msg' || settings.welcomeType === 'msg_only') && (
          <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent)', textShadow: '0 2px 10px rgba(59, 130, 246, 0.3)' }}>
            {settings.message}
          </h2>
        )}
      </div>
    );
  }

  // 2. Checkout view
  if (csState.status === 'checkout') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: 'white' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          
          <img src="/logo.jpg" alt="Logo" style={{ width: '150px', marginBottom: '2rem', borderRadius: '8px' }} onError={(e) => e.target.style.display='none'} />
          
          {settings.showTotal ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '3rem 5rem', borderRadius: '24px', border: '1px solid var(--panel-border)', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
              <p style={{ fontSize: '1.5rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>Total a Cancelar</p>
              <h1 style={{ fontSize: '6rem', margin: 0, color: 'var(--success)', fontWeight: 'bold', textShadow: '0 0 20px rgba(34, 197, 94, 0.4)' }}>
                {formatCurrency(csState.total)}
              </h1>
              
              <div style={{ marginTop: '2rem', display: 'inline-block', padding: '8px 24px', background: 'var(--panel-bg)', borderRadius: '99px', border: '1px solid var(--panel-border)', fontSize: '1.2rem', color: 'var(--text-main)' }}>
                {csState.paymentMethod === 'TRANSFERENCIA' ? '🏦 Pago por Transferencia' : '💵 Pago en Efectivo'}
              </div>
            </div>
          ) : (
             <h2 style={{ fontSize: '2.5rem', color: 'var(--text-main)' }}>Procesando cobro...</h2>
          )}

          {settings.showQR && csState.paymentMethod === 'TRANSFERENCIA' && (
            <div style={{ marginTop: '3rem', textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '1.2rem' }}>
                {csState.transferRecipient 
                  ? `Escanea para transferir a ${csState.transferRecipient}:` 
                  : 'Escanea para transferir:'}
              </p>
              <div style={{ background: 'white', padding: '1rem', borderRadius: '16px', display: 'inline-block' }}>
                {csState.qrUrl ? (
                  <img src={csState.qrUrl} alt="QR Transferencia" style={{ width: '200px', height: '200px', objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: '200px', height: '200px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', borderRadius: '8px', border: '2px dashed #94a3b8', padding: '1rem', textAlign: 'center' }}>
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

  return null;
}
