import React, { useState } from 'react';
import { LogIn, Lock, Mail, Loader2 } from 'lucide-react';
import { auth, db } from '../../firebase/config';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCreds = await signInWithEmailAndPassword(auth, email, password);
      // Registrar acceso exitoso
      await addDoc(collection(db, 'access_logs'), {
        uid: userCreds.user.uid,
        email: userCreds.user.email,
        timestamp: new Date().toISOString(),
        action: 'LOGIN_SUCCESS',
        userAgent: navigator.userAgent
      });
    } catch (err) {
      setError("Credenciales incorrectas o error de conexión.");
      console.error(err);
      // Registrar intento fallido
      try {
        await addDoc(collection(db, 'access_logs'), {
          email: email,
          timestamp: new Date().toISOString(),
          action: 'LOGIN_FAILED',
          userAgent: navigator.userAgent
        });
      } catch(e) {}
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', 
    padding: '12px 12px 12px 40px', 
    background: 'rgba(0,0,0,0.2)', 
    border: '1px solid var(--panel-border)', 
    borderRadius: '8px', 
    color: 'white',
    fontSize: '1rem',
    outline: 'none',
    fontFamily: 'Inter'
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw' }}>
      <div className="glass-panel animate-fade-in" style={{ padding: '3rem', width: '400px', maxWidth: '90%', textAlign: 'center' }}>
        
        <div style={{ marginBottom: '2rem' }}>
          <img src="/logo.jpg" alt="Gravity Denim Logo" style={{ width: '180px', borderRadius: '12px', marginBottom: '1rem', objectFit: 'contain' }} />
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.5rem', marginTop: '0.5rem' }}>Punto de Venta</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Gravity Denim</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '10px', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ position: 'relative' }}>
            <Mail size={20} style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="email" 
              placeholder="Correo electrónico" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
              style={inputStyle}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={20} style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="password" 
              placeholder="Contraseña" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
              style={inputStyle}
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            style={{ padding: '14px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}
            disabled={loading}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

      </div>
    </div>
  );
}
