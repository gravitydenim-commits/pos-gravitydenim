import React, { useState } from 'react';
import { Truck, Plus, FileText, FileCode2 } from 'lucide-react';
import NuevaGuiaModal from './NuevaGuiaModal';
import { generarGuiaA4 } from '../../utils/generadorA4Guia';

export default function GuiasScreen({ guias, salesDB, issuers, onSaveGuia }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="report-container animate-fade-in" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2><Truck className="inline" style={{verticalAlign: 'bottom'}}/> Guías de Remisión</h2>
          <span style={{color: 'var(--text-muted)'}}>Gestión de Documentos de Transporte</span>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => setIsModalOpen(true)}
          style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={20} /> Emitir Nueva Guía
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
        {guias.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
            No hay guías de remisión emitidas todavía.
          </div>
        ) : (
          <table className="pos-table" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th>FECHA</th>
                <th>SECUENCIAL</th>
                <th>TRANSPORTISTA</th>
                <th>DESTINO</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {guias.sort((a,b) => new Date(b.date?.seconds * 1000 || b.date) - new Date(a.date?.seconds * 1000 || a.date)).map((guia, idx) => {
                const guiaDate = guia.date?.seconds ? new Date(guia.date.seconds * 1000) : new Date(guia.date);
                const issuer = issuers?.find(i => i.id === guia.issuerId) || issuers[0];
                return (
                  <tr key={idx}>
                    <td>{guiaDate.toLocaleDateString('es-EC')}</td>
                    <td style={{ fontWeight: 'bold', color: '#3b82f6' }}>{guia.secuencial || '000000000'}</td>
                    <td>{guia.transportistaNombre}</td>
                    <td>{guia.destino}</td>
                    <td style={{ color: guia.status === 'AUTORIZADO' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                      {guia.status || 'AUTORIZADO'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => generarGuiaA4(guia, issuer)}
                          style={{ background: '#10b981', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                          title="Descargar PDF (A4)"
                        >
                          <FileText size={16} />
                        </button>
                        <button 
                          style={{ background: '#ef4444', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer', opacity: 0.7 }}
                          title="Descargar XML"
                        >
                          <FileCode2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <NuevaGuiaModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={onSaveGuia} 
        salesDB={salesDB} 
        issuers={issuers} 
      />
    </div>
  );
}
