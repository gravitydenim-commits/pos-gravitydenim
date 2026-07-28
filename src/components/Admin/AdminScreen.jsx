import React, { useState } from 'react';
import { Users, Shield, Clock, FileText, Lock } from 'lucide-react';
import RolesScreen from './RolesScreen';
import UsersScreen from './UsersScreen';
import AuditScreen from './AuditScreen';
import AccessScreen from './AccessScreen';

// Helper: ¿tiene el permiso, o es superAdmin?
const canAccess = (isSuperAdmin, permissions, module, action = 'ver') => {
  if (isSuperAdmin) return true;
  return permissions?.[module]?.[action] === true;
};

// Pantalla de sub-módulo bloqueado
const TabDenied = ({ label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem', color: 'var(--text-muted)' }}>
    <Lock size={48} style={{ color: '#e11d48', opacity: 0.6 }} />
    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Sin acceso a {label}</h3>
    <p style={{ textAlign: 'center', maxWidth: '360px', margin: 0 }}>
      Tu rol no tiene permiso para ver este módulo.<br />
      Solicita acceso a tu administrador.
    </p>
  </div>
);

const AdminScreen = ({ permissions, modulesConfig, isSuperAdmin }) => {
  const [activeTab, setActiveTab] = useState('usuarios');

  // Permisos por pestaña
  const tabs = [
    {
      id: 'usuarios',
      label: 'Usuarios',
      icon: <Users size={18} />,
      allowed: canAccess(isSuperAdmin, permissions, 'usuarios', 'ver'),
    },
    {
      id: 'roles',
      label: 'Roles y Permisos',
      icon: <Shield size={18} />,
      allowed: canAccess(isSuperAdmin, permissions, 'roles', 'ver'),
    },
    {
      id: 'auditoria',
      label: 'Auditoría',
      icon: <FileText size={18} />,
      allowed: canAccess(isSuperAdmin, permissions, 'auditoria', 'ver'),
    },
    {
      id: 'accesos',
      label: 'Accesos',
      icon: <Clock size={18} />,
      // 'accesos' reutiliza el permiso de auditoría — ajusta si creas un módulo propio
      allowed: canAccess(isSuperAdmin, permissions, 'auditoria', 'ver'),
    },
  ];

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

      {/* Pestañas — solo visibles si el usuario tiene acceso */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.allowed && setActiveTab(tab.id)}
            className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: tab.allowed ? 1 : 0.4,
              cursor: tab.allowed ? 'pointer' : 'not-allowed',
              position: 'relative',
            }}
            title={!tab.allowed ? 'Sin permiso para esta sección' : tab.label}
          >
            {!tab.allowed && <Lock size={14} style={{ marginRight: 2 }} />}
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', minHeight: '60vh' }}>
        {activeTab === 'roles' && (
          canAccess(isSuperAdmin, permissions, 'roles', 'ver')
            ? <RolesScreen modulesConfig={modulesConfig} isSuperAdmin={isSuperAdmin} />
            : <TabDenied label="Roles y Permisos" />
        )}
        {activeTab === 'usuarios' && (
          canAccess(isSuperAdmin, permissions, 'usuarios', 'ver')
            ? <UsersScreen modulesConfig={modulesConfig} isSuperAdmin={isSuperAdmin} />
            : <TabDenied label="Usuarios" />
        )}
        {activeTab === 'auditoria' && (
          canAccess(isSuperAdmin, permissions, 'auditoria', 'ver')
            ? <AuditScreen />
            : <TabDenied label="Auditoría" />
        )}
        {activeTab === 'accesos' && (
          canAccess(isSuperAdmin, permissions, 'auditoria', 'ver')
            ? <AccessScreen />
            : <TabDenied label="Accesos" />
        )}
      </div>
    </div>
  );
};

export default AdminScreen;
