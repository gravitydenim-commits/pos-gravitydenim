import React from 'react';
import { Package, Edit2, Trash2, PlusCircle, AlertTriangle } from 'lucide-react';

export default function InventarioScreen({ productsDB, onEdit, onDelete, onAdd }) {
  return (
    <div className="animate-fade-in" style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={28} /> Inventario Central
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Gestiona los productos, precios y stock del catálogo general.</p>
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
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Categoría</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Precio Base</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Stock</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productsDB.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No hay productos registrados en el inventario.
                </td>
              </tr>
            ) : (
              productsDB.map(prod => (
                <tr key={prod.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {prod.codigoBarras || `#${prod.id.slice(-4)}`}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>{prod.nombre || prod.name}</td>
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
