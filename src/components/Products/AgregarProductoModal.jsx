import React, { useState, useEffect } from 'react';
import { PackagePlus, Edit, X, Save, Loader2 } from 'lucide-react';

const ICON_OPTIONS = [
  { name: '👕', label: 'Camiseta' },
  { name: '👔', label: 'Camisa' },
  { name: '👚', label: 'Blusa' },
  { name: '👖', label: 'Pantalón' },
  { name: '🩳', label: 'Bermudas' },
  { name: '🩳\u200B', label: 'Short' },
  { name: '👗', label: 'Vestido' },
  { name: '🥼', label: 'Sudadera' },
  { name: '🧥', label: 'Leva' },
  { name: '👖\u200B', label: 'Pantalón de Dama' },
  { name: '🏷️', label: 'Etiquetas' },
  { name: '🧥\u200B', label: 'Busos' },
  { name: '🧥\u200B\u200B', label: 'Chompas' }
];

export default function AgregarProductoModal({ onClose, onSave, initialData }) {
  const isEditing = !!initialData;
  
  const [formData, setFormData] = useState({
    codigoBarras: '',
    nombre: '',
    categoria: 'Jeans',
    precioBase: '',
    stock: '',
    urlImagen: '',
    icono: '👕'
  });

  const [hiddenIcons, setHiddenIcons] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hiddenIcons') || '[]');
    } catch {
      return [];
    }
  });

  const handleHideIcon = (iconName, e) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = [...hiddenIcons, iconName];
    setHiddenIcons(updated);
    localStorage.setItem('hiddenIcons', JSON.stringify(updated));
  };

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        precioBase: initialData.precioBase || initialData.price || '',
      });
    }
  }, [initialData]);

  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validación básica
    if (!formData.nombre || !formData.precioBase || !formData.stock) {
      alert("Por favor completa los campos requeridos (Nombre, Precio, Stock).");
      return;
    }

    setIsSaving(true);
    
    const productoProcesado = {
      ...formData,
      precioBase: parseFloat(formData.precioBase),
      stock: parseInt(formData.stock, 10),
    };

    // Llama la función del padre pasándole los datos y si es una edición
    await onSave(productoProcesado, isEditing);
    
    setIsSaving(false);
    onClose(); 
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-content">
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
            {isEditing ? <Edit size={24} color="var(--accent)" /> : <PackagePlus size={24} color="var(--success)" />} 
            {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            
            <div className="form-group">
              <label>Código de Barras / SKU</label>
              <input 
                type="text" 
                name="codigoBarras" 
                placeholder="Ej. 786123456" 
                value={formData.codigoBarras} 
                onChange={handleChange} 
              />
            </div>

            <div className="form-group">
              <label>Nombre del Producto *</label>
              <input 
                type="text" 
                name="nombre" 
                placeholder="Ej. Vintage Denim Jacket" 
                value={formData.nombre} 
                onChange={handleChange} 
                required 
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Precio Base ($) *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  name="precioBase" 
                  placeholder="0.00" 
                  value={formData.precioBase} 
                  onChange={handleChange} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Stock *</label>
                <input 
                  type="number" 
                  name="stock" 
                  placeholder="Cantidad inicial" 
                  value={formData.stock} 
                  onChange={handleChange} 
                  required 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Categoría</label>
                <select name="categoria" value={formData.categoria} onChange={handleChange}>
                  <option value="Jeans">Jeans</option>
                  <option value="Chaquetas">Chaquetas</option>
                  <option value="Camisas">Camisas</option>
                  <option value="Accesorios">Accesorios</option>
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Icono Representativo (Elige uno)</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
                  {ICON_OPTIONS.filter(opt => !hiddenIcons.includes(opt.name)).map(opt => {
                    const isSelected = formData.icono === opt.name;
                    return (
                      <div 
                        key={opt.name} 
                        onClick={() => setFormData(prev => ({...prev, icono: opt.name}))}
                        style={{
                          position: 'relative',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--panel-border)',
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.2)',
                          padding: '8px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          width: '70px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ fontSize: '24px' }}>{opt.name}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>{opt.label}</span>
                        <button 
                          onClick={(e) => handleHideIcon(opt.name, e)}
                          title="Ocultar este icono"
                          style={{
                            position: 'absolute',
                            top: '-5px',
                            right: '-5px',
                            background: 'var(--danger)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '10px'
                          }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {hiddenIcons.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => { setHiddenIcons([]); localStorage.removeItem('hiddenIcons'); }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', marginTop: '10px', cursor: 'pointer' }}
                  >
                    Restaurar iconos ocultos
                  </button>
                )}
              </div>
            </div>

          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} disabled={isSaving}>
              {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {isSaving ? 'Guardando...' : (isEditing ? 'Actualizar Producto' : 'Guardar Producto')}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
