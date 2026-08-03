import React, { useState, useEffect } from 'react';
import { PackagePlus, Edit, X, Save, Loader2, Image as ImageIcon, Search } from 'lucide-react';

export default function AgregarProductoModal({ onClose, onSave, initialData }) {
  const isEditing = !!initialData;

  const [formData, setFormData] = useState({
    codigoBarras: '',
    nombre: '',
    categoria: 'Jeans',
    precioBase: '',
    stock: '',
    urlImagen: '',
    ownerId: '',
    ownerName: '',
    ilustracion3d: ''
  });

  const [owners, setOwners] = useState([]);
  const [illustrations, setIllustrations] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Carga propietarios
  useEffect(() => {
    const fetchOwners = async () => {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../../firebase/config');
        const snap = await getDoc(doc(db, 'settings', 'owners'));
        let list = ['Edgar', 'Amparito', 'Fabián'];
        if (snap.exists() && Array.isArray(snap.data().list)) {
          list = snap.data().list;
        }
        setOwners(list);
        if (!initialData) {
          const edgar = list.find(o => o.toLowerCase().includes('edgar')) || list[0] || '';
          setFormData(prev => ({ ...prev, ownerId: edgar, ownerName: edgar }));
        }
      } catch (err) {
        console.error('Error cargando propietarios:', err);
      }
    };
    fetchOwners();
  }, [initialData]);

  // Carga manifest de renders 3D
  useEffect(() => {
    const fetchManifest = async () => {
      try {
        const response = await fetch('/product-illustrations/3d/manifest.json');
        const data = await response.json();
        if (data && Array.isArray(data.illustrations)) {
          setIllustrations(data.illustrations);
        }
      } catch (err) {
        console.error('Error cargando manifest de ilustraciones 3D:', err);
      }
    };
    fetchManifest();
  }, []);

  // Carga datos para edición
  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        precioBase: initialData.precioBase || initialData.price || '',
        ownerId: initialData.ownerId || '',
        ownerName: initialData.ownerName || '',
        ilustracion3d: initialData.ilustracion3d || initialData.ilustracion_3d || ''
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre || !formData.precioBase || !formData.stock || !formData.ownerId) {
      alert('Por favor completa los campos requeridos (Nombre, Precio, Stock, Propietario).');
      return;
    }
    setIsSaving(true);
    const productoProcesado = {
      ...formData,
      precioBase: parseFloat(formData.precioBase),
      stock: parseInt(formData.stock, 10),
    };
    await onSave(productoProcesado, isEditing);
    setIsSaving(false);
    onClose();
  };

  const selectedItem = illustrations.find(i => i.id === formData.ilustracion3d);
  const filteredIllustrations = illustrations.filter(item =>
    galleryFilter === '' ||
    item.name.toLowerCase().includes(galleryFilter.toLowerCase()) ||
    item.category.toLowerCase().includes(galleryFilter.toLowerCase())
  );

  // Agrupar por categoría para la galería
  const byCategory = filteredIllustrations.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

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
                value={formData.codigoBarras || ''}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Nombre del Producto *</label>
              <input
                type="text"
                name="nombre"
                placeholder="Ej. Jean Slim Azul Oscuro"
                value={formData.nombre || ''}
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
                  value={formData.precioBase || ''}
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
                  value={formData.stock || ''}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Categoría</label>
                <select name="categoria" value={formData.categoria || 'Jeans'} onChange={handleChange}>
                  <option value="Jeans">Jeans</option>
                  <option value="Camisas">Camisas</option>
                  <option value="Chaquetas">Chaquetas</option>
                  <option value="Accesorios">Accesorios</option>
                </select>
              </div>

              <div className="form-group">
                <label>Propietario / Hermano *</label>
                <select
                  name="ownerId"
                  value={formData.ownerId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, ownerId: val, ownerName: val }));
                  }}
                  required
                >
                  <option value="">Seleccionar Propietario...</option>
                  {owners.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>URL de Fotografía Real (opcional)</label>
              <input
                type="url"
                name="urlImagen"
                placeholder="https://... (foto real del producto)"
                value={formData.urlImagen || ''}
                onChange={handleChange}
              />
              {formData.urlImagen && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <img src={formData.urlImagen} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--panel-border)' }} onError={e => { e.target.style.display = 'none'; }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prioridad 1 — La foto real siempre se muestra primero</span>
                </div>
              )}
            </div>

            {/* ── SELECTOR DE RENDER 3D ── */}
            <div
              className="form-group"
              style={{
                borderTop: '1px solid var(--panel-border)',
                paddingTop: '1rem',
                marginTop: '0.5rem'
              }}
            >
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ImageIcon size={16} color="var(--accent)" />
                  Imagen 3D de la Prenda
                </span>
                {formData.ilustracion3d && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, ilustracion3d: '' }))}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    ✕ Quitar selección
                  </button>
                )}
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {/* Vista previa del render seleccionado */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: selectedItem ? 'rgba(59,130,246,0.08)' : 'rgba(0,0,0,0.15)',
                  border: selectedItem ? '1px solid var(--accent)' : '1px dashed var(--panel-border)',
                  borderRadius: '10px',
                  minHeight: '64px'
                }}>
                  {selectedItem ? (
                    <>
                      <img
                        src={selectedItem.path}
                        alt={selectedItem.name}
                        style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}
                      />
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>{selectedItem.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: '2px' }}>{selectedItem.category} · ID: {selectedItem.id}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--success)', marginTop: '2px' }}>✓ Selección manual — prioridad 2</div>
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>
                      Sin render 3D seleccionado — se usará fallback automático por nombre
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowGallery(true)}
                  style={{ whiteSpace: 'nowrap', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <ImageIcon size={16} />
                  Elegir imagen 3D
                </button>
              </div>

              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                <strong>Prioridad:</strong> 1. Fotografía real · 2. Render 3D elegido manualmente · 3. Render automático por nombre · 4. Imagen genérica
              </div>
            </div>

          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {isSaving ? 'Guardando...' : (isEditing ? 'Actualizar Producto' : 'Guardar Producto')}
            </button>
          </div>
        </form>
      </div>

      {/* ── GALERÍA DE RENDERS 3D (modal interno) ── */}
      {showGallery && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999,
            backdropFilter: 'blur(10px)'
          }}
          onClick={() => setShowGallery(false)}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--panel-border)',
              borderRadius: '18px',
              width: '92vw',
              maxWidth: '780px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header galería */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-main)', fontWeight: 'bold' }}>
                  🎨 Biblioteca de Renders 3D
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {illustrations.length} prendas disponibles · Renders fotorrealistas de catálogo
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Búsqueda */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Buscar prenda..."
                    value={galleryFilter}
                    onChange={e => setGalleryFilter(e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '8px',
                      color: 'var(--text-main)',
                      padding: '6px 10px 6px 30px',
                      fontSize: '0.8rem',
                      width: '160px',
                      outline: 'none'
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowGallery(false)}
                  style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Grid de renders agrupado por categoría */}
            <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', flex: 1 }}>
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: '1.25rem' }}>
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: '800',
                    letterSpacing: '0.1em',
                    color: 'var(--accent)',
                    textTransform: 'uppercase',
                    marginBottom: '0.5rem',
                    paddingBottom: '4px',
                    borderBottom: '1px solid rgba(59,130,246,0.15)'
                  }}>
                    {cat}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.65rem' }}>
                    {items.map(item => {
                      const isSelected = formData.ilustracion3d === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, ilustracion3d: item.id }));
                            setShowGallery(false);
                          }}
                          style={{
                            border: isSelected ? '2px solid var(--accent)' : '1px solid var(--panel-border)',
                            backgroundColor: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.02)',
                            borderRadius: '10px',
                            padding: '0.5rem 0.4rem',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'all 0.15s ease',
                            textAlign: 'center',
                            position: 'relative'
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--panel-border)'; }}
                        >
                          {isSelected && (
                            <div style={{
                              position: 'absolute', top: 5, right: 5,
                              background: 'var(--accent)', color: 'white',
                              borderRadius: '50%', width: 18, height: 18,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '10px', fontWeight: 'bold'
                            }}>✓</div>
                          )}
                          <img
                            src={item.path}
                            alt={item.name}
                            style={{
                              width: '100%',
                              height: '88px',
                              objectFit: 'contain',
                              borderRadius: '6px',
                              background: 'rgba(255,255,255,0.04)'
                            }}
                            onError={e => { e.target.src = '/product-illustrations/3d/default_3d.png'; }}
                          />
                          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--text-main)', lineHeight: '1.25', marginTop: '0.1rem' }}>
                            {item.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {filteredIllustrations.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.85rem' }}>
                  No se encontraron prendas con "{galleryFilter}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
