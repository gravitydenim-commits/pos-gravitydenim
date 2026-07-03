import React, { useState } from 'react';
import { Users, Shield, Clock, FileText } from 'lucide-react';
import RolesScreen from './RolesScreen';
import UsersScreen from './UsersScreen';
import AuditScreen from './AuditScreen';
import AccessScreen from './AccessScreen';

const AdminScreen = ({ permissions, modulesConfig, isSuperAdmin }) => {
  const [activeTab, setActiveTab] = useState('usuarios');

  return (
    <div className="pos-screen" style={{ overflowY: 'auto' }}>
      <header className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield className="text-accent" /> Administración Global y Seguridad
        </h1>
        <p style={{ color: 'var(--text-color)', opacity: 0.8, marginTop: '0.5rem' }}>
          Configura usuarios, roles granulares, y revisa los historiales de auditoría del sistema.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('usuarios')}
          className={`btn ${activeTab === 'usuarios' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Users size={18} /> Usuarios
        </button>
        <button 
          onClick={() => setActiveTab('roles')}
          className={`btn ${activeTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Shield size={18} /> Roles y Permisos
        </button>
        <button 
          onClick={() => setActiveTab('auditoria')}
          className={`btn ${activeTab === 'auditoria' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <FileText size={18} /> Auditoría
        </button>
        <button 
          onClick={() => setActiveTab('accesos')}
          className={`btn ${activeTab === 'accesos' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Clock size={18} /> Accesos
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', minHeight: '60vh' }}>
        {activeTab === 'roles' && (
          <RolesScreen modulesConfig={modulesConfig} isSuperAdmin={isSuperAdmin} />
        )}
        {activeTab === 'usuarios' && (
          <UsersScreen modulesConfig={modulesConfig} isSuperAdmin={isSuperAdmin} />
        )}
        {activeTab === 'auditoria' && (
          <AuditScreen />
        )}
        {activeTab === 'accesos' && (
          <AccessScreen />
        )}
      </div>
    </div>
  );
};

export default AdminScreen;
