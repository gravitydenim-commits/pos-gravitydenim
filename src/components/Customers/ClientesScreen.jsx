import React, { useState } from 'react';
import { Users, Edit2, Trash2, Mail, MapPin, Phone, Search, X } from 'lucide-react';

export default function ClientesScreen({ customersDB, onAdd, onEdit, onDelete }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = customersDB.filter(cliente => {
    const searchLower = searchTerm.toLowerCase();
    const nombreMatches = (cliente.nombre || '').toLowerCase().includes(searchLower);
    const idMatches = (cliente.numeroIdentificacion || '').toLowerCase().includes(searchLower);
    return nombreMatches || idMatches;
  });

  return (
    <div className="animate-fade-in" style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={28} /> Base de Datos de Clientes
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Visualiza y administra los clientes registrados en el sistema.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o cédula/RUC..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '10px 35px', 
                borderRadius: '8px', 
                border: '1px solid var(--panel-border)', 
                background: 'rgba(0,0,0,0.2)', 
                color: 'white',
                outline: 'none',
                fontSize: '0.95rem'
              }}
            />
            {searchTerm && (
              <X 
                size={16} 
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSearchTerm('')}
              />
            )}
          </div>
          
          <button 
            className="btn-success" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '10px 20px' }}
            onClick={onAdd}
          >
            <Users size={20} /> Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--panel-border)' }}>
            <tr>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Identificación</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Nombre / Razón Social</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Contacto</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Dirección</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {customersDB.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No hay clientes registrados en la base de datos.
                </td>
              </tr>
            ) : filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No se encontraron clientes que coincidan con la búsqueda "{searchTerm}".
                </td>
              </tr>
            ) : (
              filteredCustomers.map(cliente => (
                <tr key={cliente.numeroIdentificacion} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <span style={{ fontSize: '0.7rem', display: 'block', color: 'var(--accent)' }}>{cliente.tipoDocumento}</span>
                    {cliente.numeroIdentificacion}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>{cliente.nombre}</td>
                  <td style={{ padding: '1rem' }}>
                    {cliente.correo && cliente.correo !== 'N/A' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <Mail size={14} /> {cliente.correo}
                      </div>
                    )}
                    {cliente.telefono && cliente.telefono !== 'N/A' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <Phone size={14} /> {cliente.telefono}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {cliente.direccion && cliente.direccion !== 'N/A' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <MapPin size={14} /> {cliente.direccion}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '6px' }}
                        onClick={() => {
                          onEdit(cliente);
                        }}
                        title="Editar Cliente"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        className="btn-danger" 
                        style={{ padding: '6px' }}
                        onClick={() => {
                          if(window.confirm(`¿Seguro que deseas eliminar el registro de "${cliente.nombre}"?`)) {
                            onDelete(cliente.numeroIdentificacion);
                          }
                        }}
                        title="Eliminar Cliente"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
