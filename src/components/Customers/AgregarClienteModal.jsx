import React, { useState } from 'react';
import { UserPlus, X, Save, Loader2 } from 'lucide-react';

export default function AgregarClienteModal({ initialData, onClose, onSave }) {
  const isEditing = !!initialData;
  const [formData, setFormData] = useState(initialData || {
    tipoDocumento: 'CEDULA',
    numeroIdentificacion: '',
    nombre: '',
    correo: '',
    direccion: '',
    telefono: ''
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      await onSave(formData, isEditing);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar el cliente');
    }
    setIsSaving(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid var(--panel-border)',
    color: 'white',
    borderRadius: '4px',
    marginTop: '5px'
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="glass-panel animate-slide-up" style={{ width: '400px', padding: '2rem', position: 'relative' }}>
        
        <button 
          onClick={onClose} 
          style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', color: 'var(--text-muted)' }}
        >
          <X size={24} />
        </button>

        <h3 style={{ color: 'var(--accent)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserPlus size={24} /> {isEditing ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
        </h3>

        {error && <div style={{ color: '#ff4d4f', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tipo de Documento</label>
            <select 
              name="tipoDocumento" 
              value={formData.tipoDocumento} 
              onChange={handleChange}
              style={inputStyle}
            >
              <option value="CEDULA">Cédula</option>
              <option value="RUC">RUC</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nro. Identificación *</label>
            <input 
              type="text" 
              name="numeroIdentificacion" 
              value={formData.numeroIdentificacion} 
              onChange={handleChange}
              required
              disabled={isEditing}
              style={{ ...inputStyle, opacity: isEditing ? 0.6 : 1, cursor: isEditing ? 'not-allowed' : 'text' }}
              placeholder="0999999999"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nombres Completos / Razón Social *</label>
            <input 
              type="text" 
              name="nombre" 
              value={formData.nombre} 
              onChange={handleChange}
              required
              style={inputStyle}
              placeholder="Ej. Juan Pérez"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Correo Electrónico</label>
            <input 
              type="email" 
              name="correo" 
              value={formData.correo} 
              onChange={handleChange}
              style={inputStyle}
              placeholder="opcional@correo.com"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Teléfono</label>
            <input 
              type="tel" 
              name="telefono" 
              value={formData.telefono} 
              onChange={handleChange}
              style={inputStyle}
              placeholder="Ej. 0991234567"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Dirección Completa</label>
            <input 
              type="text" 
              name="direccion" 
              value={formData.direccion} 
              onChange={handleChange}
              style={inputStyle}
              placeholder="Ej. Av. Principal..."
            />
          </div>

          <button 
            type="submit" 
            className="btn-success" 
            style={{ width: '100%', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            {isSaving ? 'Guardando...' : 'Guardar Cliente'}
          </button>
        </form>

      </div>
    </div>
  );
}
