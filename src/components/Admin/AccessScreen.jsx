import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Clock, Search } from 'lucide-react';

const AccessScreen = () => {
  const [accessLogs, setAccessLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Escuchar los últimos 100 registros de accesos
    const q = query(collection(db, 'access_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccessLogs(data);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = accessLogs.filter(log => 
    log.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Historial de Accesos</h2>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)', width: '300px' }}>
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar por correo..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', width: '100%', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ background: 'var(--bg-color)', borderRadius: '12px', overflow: 'hidden' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Fecha y Hora</th>
              <th>Correo del Usuario</th>
              <th>Acción</th>
              <th>IP / Dispositivo</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No hay registros de accesos recientes. (Nota: esta función requiere que el Login guarde registros en access_logs).</td></tr>
            ) : filteredLogs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: '0.85rem' }}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold' }}>{log.email}</td>
                <td>
                  <span style={{ 
                    color: log.action === 'LOGIN_SUCCESS' ? '#22c55e' : log.action === 'LOGIN_FAILED' ? 'var(--danger-color)' : 'var(--text-muted)',
                    fontWeight: 'bold', fontSize: '0.85rem'
                  }}>
                    {log.action === 'LOGIN_SUCCESS' ? 'Inicio de Sesión' : log.action === 'LOGIN_FAILED' ? 'Intento Fallido' : 'Cierre de Sesión'}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{log.userAgent || 'Desconocido'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccessScreen;
