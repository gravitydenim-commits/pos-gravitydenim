import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Save, Plus, Trash2, Edit2, CheckSquare, Square, ShieldAlert } from 'lucide-react';

const RolesScreen = ({ modulesConfig, isSuperAdmin }) => {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'roles'), (snap) => {
      const data = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setRoles(data);
    });
    return () => unsub();
  }, []);

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const newRole = {
        name: newRoleName,
        permissions: {},
        isSuperAdmin: false // Los super admins solo pueden ser creados directo en base de datos o por otro superadmin (quemado)
      };
      
      // Construir permisos por defecto (todo falso)
      modulesConfig.forEach(mod => {
        newRole.permissions[mod.id] = {};
        mod.actions.forEach(act => {
          newRole.permissions[mod.id][act] = false;
        });
      });

      const docRef = await addDoc(collection(db, 'roles'), newRole);
      setNewRoleName('');
      setIsCreating(false);
      handleSelectRole({ ...newRole, id: docRef.id });
    } catch (error) {
      console.error("Error creando rol", error);
      alert("Error al crear rol");
    }
  };

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    setEditingPermissions(JSON.parse(JSON.stringify(role.permissions || {}))); // Clone
  };

  const togglePermission = (moduleId, actionId) => {
    setEditingPermissions(prev => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] || {}),
        [actionId]: !(prev[moduleId]?.[actionId])
      }
    }));
  };

  const setModuleAll = (moduleId, state) => {
    const moduleInfo = modulesConfig.find(m => m.id === moduleId);
    if (!moduleInfo) return;
    
    setEditingPermissions(prev => {
      const newModulePerms = { ...(prev[moduleId] || {}) };
      moduleInfo.actions.forEach(act => {
        newModulePerms[act] = state;
      });
      return { ...prev, [moduleId]: newModulePerms };
    });
  };

  const saveRole = async () => {
    if (!selectedRole) return;
    try {
      await setDoc(doc(db, 'roles', selectedRole.id), {
        ...selectedRole,
        permissions: editingPermissions
      });
      alert('✅ Permisos del Rol actualizados exitosamente.');
    } catch (error) {
      console.error("Error guardando", error);
      alert('⚠️ Error al guardar los permisos.');
    }
  };

  const deleteRole = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este rol? Los usuarios con este rol podrían perder acceso.")) return;
    try {
      await deleteDoc(doc(db, 'roles', id));
      if (selectedRole?.id === id) setSelectedRole(null);
    } catch (error) {
      console.error("Error eliminando rol", error);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', height: '100%' }}>
      {/* Panel Izquierdo: Lista de Roles */}
      <div style={{ width: '300px', borderRight: '1px solid rgba(128,128,128,0.2)', paddingRight: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontWeight: 'bold' }}>Roles del Sistema</h3>
          <button className="btn-icon" onClick={() => setIsCreating(true)} title="Nuevo Rol">
            <Plus size={20} />
          </button>
        </div>

        {isCreating && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input 
              className="input-field" 
              placeholder="Nombre del Rol..." 
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary" onClick={handleCreateRole} style={{ padding: '0.5rem' }}>
              <Save size={16} />
            </button>
            <button className="btn btn-secondary" onClick={() => setIsCreating(false)} style={{ padding: '0.5rem' }}>
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {roles.map(role => (
            <div 
              key={role.id}
              onClick={() => handleSelectRole(role)}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: selectedRole?.id === role.id ? 'var(--accent)' : 'rgba(128,128,128,0.1)',
                color: selectedRole?.id === role.id ? '#fff' : 'inherit',
                fontWeight: selectedRole?.id === role.id ? 'bold' : 'normal'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {role.isSuperAdmin && <ShieldAlert size={16} />}
                {role.name}
              </div>
              {!role.isSuperAdmin && (
                <button 
                  className="btn-icon" 
                  onClick={(e) => { e.stopPropagation(); deleteRole(role.id); }}
                  style={{ color: selectedRole?.id === role.id ? '#fff' : 'var(--danger-color)', padding: '4px' }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Panel Derecho: Matriz de Permisos */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem', maxHeight: '70vh' }}>
        {!selectedRole ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, flexDirection: 'column', gap: '1rem' }}>
            <ShieldAlert size={64} />
            <h2>Selecciona un rol para ver y editar sus permisos</h2>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2>
                Permisos: <span style={{ color: 'var(--accent)' }}>{selectedRole.name}</span>
                {selectedRole.isSuperAdmin && <span style={{ fontSize: '0.9rem', color: 'var(--danger-color)', marginLeft: '1rem' }}>(Este rol tiene control absoluto)</span>}
              </h2>
              <button 
                className="btn btn-primary" 
                onClick={saveRole} 
                disabled={selectedRole.isSuperAdmin}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Save size={18} /> Guardar Cambios
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {modulesConfig?.map(mod => (
                <div key={mod.id} style={{ background: 'rgba(128,128,128,0.05)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(128,128,128,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(128,128,128,0.2)', paddingBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontWeight: 'bold' }}>{mod.label}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setModuleAll(mod.id, true)} disabled={selectedRole.isSuperAdmin}>Marcar Todos</button>
                      <button className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setModuleAll(mod.id, false)} disabled={selectedRole.isSuperAdmin}>Desmarcar Todos</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                    {mod.actions.map(action => {
                      const hasPerm = selectedRole.isSuperAdmin ? true : (editingPermissions?.[mod.id]?.[action] || false);
                      return (
                        <div 
                          key={action} 
                          onClick={() => !selectedRole.isSuperAdmin && togglePermission(mod.id, action)}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            cursor: selectedRole.isSuperAdmin ? 'not-allowed' : 'pointer',
                            opacity: selectedRole.isSuperAdmin ? 0.7 : 1,
                            userSelect: 'none'
                          }}
                        >
                          {hasPerm ? (
                            <CheckSquare size={20} style={{ color: 'var(--accent)' }} />
                          ) : (
                            <Square size={20} style={{ color: 'var(--text-color)', opacity: 0.5 }} />
                          )}
                          <span style={{ textTransform: 'capitalize' }}>{action.replace('_', ' ')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default RolesScreen;
