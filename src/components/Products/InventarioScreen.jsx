import React, { useState, useEffect } from 'react';
import { Package, Edit2, Trash2, PlusCircle, AlertTriangle, Shirt, ShoppingBag, Tag, Scissors, Briefcase, Glasses, Watch, Gem, UserCheck } from 'lucide-react';

export default function InventarioScreen({ productsDB, onEdit, onDelete, onAdd }) {
  const [owners, setOwners] = useState([]);
  const [selectedBulkOwnerId, setSelectedBulkOwnerId] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);

  useEffect(() => {
    const fetchOwners = async () => {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../../firebase/config');
        const snap = await getDoc(doc(db, 'settings', 'owners'));
        if (snap.exists() && Array.isArray(snap.data().list)) {
          setOwners(snap.data().list);
        } else {
          setOwners(['Edgar', 'Amparito', 'Junior']);
        }
      } catch (err) {
        console.error("Error loading owners:", err);
      }
    };
    fetchOwners();
  }, []);

  const handleBulkAssign = async () => {
    if (!selectedBulkOwnerId) {
      alert("Por favor selecciona un hermano primero.");
      return;
    }

    if (!window.confirm(`¿Seguro que deseas asignar a "${selectedBulkOwnerId}" como propietario de TODOS los productos en el catálogo?`)) {
      return;
    }

    setApplyingBulk(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../../firebase/config');
      
      // Actualizar secuencialmente en lotes
      for (const prod of productsDB) {
        await updateDoc(doc(db, 'products', prod.id), {
          ownerId: selectedBulkOwnerId,
          ownerName: selectedBulkOwnerId
        });
      }
      alert(`✅ Se asignó exitosamente a "${selectedBulkOwnerId}" como propietario de todos los productos.`);
      window.location.reload();
    } catch (err) {
      alert("Error en asignación masiva: " + err.message);
    } finally {
      setApplyingBulk(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={28} /> Inventario Central
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Gestiona los productos, precios y stock del catálogo general.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Asignación Masiva:</span>
          <select 
            value={selectedBulkOwnerId} 
            onChange={(e) => setSelectedBulkOwnerId(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
          >
            <option value="">Seleccionar Hermano...</option>
            {owners.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button 
            onClick={handleBulkAssign}
            disabled={applyingBulk}
            className="btn-primary" 
            style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <UserCheck size={16} /> {applyingBulk ? 'Aplicando...' : 'Asignar a Todos'}
          </button>
        </div>

        <button className="btn-success" onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '12px 20px' }}>
          <PlusCircle size={20} /> Nuevo Producto
        </button>
      </div>

      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--panel-border)' }}>
            <tr>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>SKU / Ref</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Producto</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Propietario / Hermano</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Categoría</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Precio Base</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Stock</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productsDB.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No hay productos registrados en el inventario.
                </td>
              </tr>
            ) : (
              productsDB.map(prod => (
                <tr key={prod.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {prod.codigoBarras || `#${prod.id.slice(-4)}`}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {(() => {
                      if (prod.icono) {
                        if (prod.icono === 'Shirt') return <Shirt size={18} color="var(--accent)"/>;
                        if (prod.icono === 'ShoppingBag') return <ShoppingBag size={18} color="var(--accent)"/>;
                        if (prod.icono === 'Tag') return <Tag size={18} color="var(--accent)"/>;
                        if (prod.icono === 'Scissors') return <Scissors size={18} color="var(--accent)"/>;
                        if (prod.icono === 'Package') return <Package size={18} color="var(--accent)"/>;
                        if (prod.icono === 'Briefcase') return <Briefcase size={18} color="var(--accent)"/>;
                        if (prod.icono === 'Glasses') return <Glasses size={18} color="var(--accent)"/>;
                        if (prod.icono === 'Watch') return <Watch size={18} color="var(--accent)"/>;
                        if (prod.icono === 'Gem') return <Gem size={18} color="var(--accent)"/>;
                        return <span style={{ fontSize: '18px', lineHeight: 1 }}>{prod.icono}</span>;
                      }
                      
                      const cat = (prod.categoria || '').toLowerCase();
                      if (cat.includes('jeans')) return <Shirt size={18} color="var(--accent)"/>;
                      if (cat.includes('chaqueta')) return <ShoppingBag size={18} color="var(--accent)"/>;
                      if (cat.includes('camisa')) return <Shirt size={18} color="var(--accent)"/>;
                      if (cat.includes('accesorio')) return <Tag size={18} color="var(--accent)"/>;
                      if (cat.includes('sastreria') || cat.includes('costura')) return <Scissors size={18} color="var(--accent)"/>;
                      return <Package size={18} color="var(--accent)"/>;
                    })()}
                    {prod.nombre || prod.name}
                  </td>
                  <td style={{ padding: '1rem', fontStyle: prod.ownerName ? 'normal' : 'italic', color: prod.ownerName ? 'white' : 'var(--text-muted)' }}>
                    {prod.ownerName || 'Sin asignar'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>
                      {prod.categoria || 'General'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--success)' }}>
                    ${(prod.precioBase || prod.price || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {prod.stock < 5 ? (
                      <span style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold' }}>
                        <AlertTriangle size={16} /> {prod.stock || 0}
                      </span>
                    ) : (
                      <span>{prod.stock || 0}</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '6px' }}
                        onClick={() => onEdit(prod)}
                        title="Editar Producto"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        className="btn-danger" 
                        style={{ padding: '6px' }}
                        onClick={() => {
                          if(window.confirm(`¿Seguro que deseas eliminar "${prod.nombre || prod.name}"?`)) {
                            onDelete(prod.id);
                          }
                        }}
                        title="Eliminar Producto"
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
