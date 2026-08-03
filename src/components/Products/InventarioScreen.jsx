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
          setOwners(['Edgar', 'Amparito', 'FabiÃ¡n']);
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

    if (!window.confirm(`Â¿Seguro que deseas asignar a "${selectedBulkOwnerId}" como propietario de TODOS los productos en el catÃ¡logo?`)) {
      return;
    }

    setApplyingBulk(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../../firebase/config');
      
      for (const prod of productsDB) {
        await updateDoc(doc(db, 'products', prod.id), {
          ownerId: selectedBulkOwnerId,
          ownerName: selectedBulkOwnerId
        });
      }
      alert(`â Se asignÃ³ exitosamente a "${selectedBulkOwnerId}" como propietario de todos los productos.`);
      window.location.reload();
    } catch (err) {
      alert("Error en asignaciÃ³n masiva: " + err.message);
    } finally {
      setApplyingBulk(false);
    }
  };

  const isIminMode = typeof window !== 'undefined' && (
    localStorage.getItem('iminSwanEnabled') === 'true' || 
    /imin|iMin|I20D01|D4-504|I24D03|DS2-25/i.test(navigator.userAgent) ||
    Boolean(window.AndroidBridge)
  );

  const cellPadding = isIminMode ? '0.5rem 0.75rem' : '1rem';

  return (
    <div className="animate-fade-in" style={{ padding: isIminMode ? '0.75rem' : '2rem', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isIminMode ? '0.75rem' : '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: isIminMode ? '1.5rem' : '1.8rem' }}>
            <Package size={isIminMode ? 22 : 28} /> Inventario Central
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '2px 0 0 0', fontSize: isIminMode ? '0.85rem' : '1rem' }}>Gestiona los productos, precios y stock del catÃ¡logo general.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: isIminMode ? '6px 12px' : '10px 15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>AsignaciÃ³n Masiva:</span>
          <select 
            value={selectedBulkOwnerId} 
            onChange={(e) => setSelectedBulkOwnerId(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.8rem' }}
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
            style={{ padding: '5px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <UserCheck size={14} /> {applyingBulk ? 'Aplicando...' : 'Asignar a Todos'}
          </button>
        </div>

        <button className="btn-success" onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: isIminMode ? '8px 16px' : '12px 20px', fontSize: isIminMode ? '0.9rem' : '1.05rem' }}>
          <PlusCircle size={isIminMode ? 18 : 20} /> Nuevo Producto
        </button>
      </div>

      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '0', border: '1px solid var(--panel-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--panel-border)', position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={{ padding: cellPadding, color: 'var(--text-muted)', fontSize: isIminMode ? '0.85rem' : '1rem' }}>SKU / Ref</th>
              <th style={{ padding: cellPadding, color: 'var(--text-muted)', fontSize: isIminMode ? '0.85rem' : '1rem' }}>Producto</th>
              <th style={{ padding: cellPadding, color: 'var(--text-muted)', fontSize: isIminMode ? '0.85rem' : '1rem' }}>Propietario / Hermano</th>
              <th style={{ padding: cellPadding, color: 'var(--text-muted)', fontSize: isIminMode ? '0.85rem' : '1rem' }}>CategorÃ­a</th>
              <th style={{ padding: cellPadding, color: 'var(--text-muted)', fontSize: isIminMode ? '0.85rem' : '1rem' }}>Precio Base</th>
              <th style={{ padding: cellPadding, color: 'var(--text-muted)', fontSize: isIminMode ? '0.85rem' : '1rem' }}>Stock</th>
              <th style={{ padding: cellPadding, color: 'var(--text-muted)', textAlign: 'right', fontSize: isIminMode ? '0.85rem' : '1rem' }}>Acciones</th>
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
                <tr key={prod.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: isIminMode ? '0.9rem' : '1rem' }}>
                  <td style={{ padding: cellPadding, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {prod.codigoBarras || `#${prod.id.slice(-4)}`}
                  </td>
                  <td style={{ padding: cellPadding, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(() => {
                      if (prod.icono) {
                        if (prod.icono === 'Shirt') return <Shirt size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'ShoppingBag') return <ShoppingBag size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'Tag') return <Tag size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'Scissors') return <Scissors size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'Package') return <Package size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'Briefcase') return <Briefcase size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'Glasses') return <Glasses size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'Watch') return <Watch size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        if (prod.icono === 'Gem') return <Gem size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                        return <span style={{ fontSize: isIminMode ? '16px' : '18px', lineHeight: 1 }}>{prod.icono}</span>;
                      }
                      
                      const cat = (prod.categoria || '').toLowerCase();
                      if (cat.includes('jeans')) return <Shirt size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                      if (cat.includes('chaqueta')) return <ShoppingBag size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                      if (cat.includes('camisa')) return <Shirt size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                      if (cat.includes('accesorio')) return <Tag size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                      if (cat.includes('sastreria') || cat.includes('costura')) return <Scissors size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                      return <Package size={isIminMode ? 16 : 18} color="var(--accent)"/>;
                    })()}
                    {prod.nombre || prod.name}
                  </td>
                  <td style={{ padding: cellPadding, fontStyle: prod.ownerName ? 'normal' : 'italic', color: prod.ownerName ? 'white' : 'var(--text-muted)' }}>
                    {prod.ownerName || 'Sin asignar'}
                  </td>
                  <td style={{ padding: cellPadding }}>
                    <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.75rem' }}>
                      {prod.categoria || 'General'}
                    </span>
                  </td>
                  <td style={{ padding: cellPadding, color: 'var(--success)' }}>
                    ${(prod.precioBase || prod.price || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: cellPadding }}>
                    {prod.stock < 5 ? (
                      <span style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 'bold' }}>
                        <AlertTriangle size={isIminMode ? 14 : 16} /> {prod.stock || 0}
                      </span>
                    ) : (
                      <span>{prod.stock || 0}</span>
                    )}
                  </td>
                  <td style={{ padding: cellPadding, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn-primary" 
                        style={{ padding: isIminMode ? '4px' : '6px' }}
                        onClick={() => onEdit(prod)}
                        title="Editar Producto"
                      >
                        <Edit2 size={isIminMode ? 14 : 16} />
                      </button>
                      <button 
                        className="btn-danger" 
                        style={{ padding: isIminMode ? '4px' : '6px' }}
                        onClick={() => {
                          if(window.confirm(`Â¿Seguro que deseas eliminar "${prod.nombre || prod.name}"?`)) {
                            onDelete(prod.id);
                          }
                        }}
                        title="Eliminar Producto"
                      >
                        <Trash2 size={isIminMode ? 14 : 16} />
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
