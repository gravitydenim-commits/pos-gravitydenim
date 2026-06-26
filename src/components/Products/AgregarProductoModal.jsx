import React, { useState, useEffect } from 'react';
import { PackagePlus, Edit, X, Save, Loader2, UploadCloud } from 'lucide-react';
import { storage } from '../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function AgregarProductoModal({ onClose, onSave, initialData }) {
  const isEditing = !!initialData;
  
  const [formData, setFormData] = useState({
    codigoBarras: '',
    nombre: '',
    categoria: 'Jeans',
    precioBase: '',
    stock: '',
    urlImagen: ''
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        precioBase: initialData.precioBase || initialData.price || '',
      });
    }
  }, [initialData]);

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      setFormData(prev => ({ ...prev, urlImagen: downloadURL }));
      alert('✅ Imagen subida correctamente.');
    } catch (error) {
      console.error("Error al subir la imagen:", error);
      alert('⚠️ Hubo un error al subir la imagen.');
    } finally {
      setIsUploading(false);
    }
  };

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

              <div className="form-group">
                <label>Imagen del Producto</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', gap: '0.5rem', flex: 1, justifyContent: 'center' }}>
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
                    {isUploading ? 'Subiendo...' : 'Subir desde la PC'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={handleImageUpload} 
                      disabled={isUploading}
                    />
                  </label>
                </div>
                {formData.urlImagen && (
                  <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                    <img src={formData.urlImagen} alt="Vista previa" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #333' }} />
                  </div>
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
