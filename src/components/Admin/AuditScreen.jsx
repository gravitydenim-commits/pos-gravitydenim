import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { FileText, Search } from 'lucide-react';

const AuditScreen = () => {
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Escuchar los últimos 100 registros de auditoría
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    log.module?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Historial de Auditoría</h2>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)', width: '300px' }}>
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar usuario o módulo..." 
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
              <th>Usuario</th>
              <th>Módulo</th>
              <th>Acción</th>
              <th>Detalle (ID)</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No hay registros de auditoría aún.</td></tr>
            ) : filteredLogs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: '0.85rem' }}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold' }}>{log.userName}</td>
                <td><span style={{ padding: '2px 8px', background: 'rgba(128,128,128,0.1)', borderRadius: '4px', fontSize: '0.85rem' }}>{log.module}</span></td>
                <td>
                  <span style={{ 
                    color: log.action === 'CREATE' ? '#22c55e' : log.action === 'DELETE' ? 'var(--danger-color)' : 'var(--accent)',
                    fontWeight: 'bold', fontSize: '0.85rem'
                  }}>
                    {log.action}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.documentId}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{log.ipAddress || 'Desconocida'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditScreen;
