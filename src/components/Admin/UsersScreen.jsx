import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Save, Plus, Trash2, Edit2, Shield, UserX, UserCheck, Copy } from 'lucide-react';

const UsersScreen = ({ modulesConfig, isSuperAdmin }) => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Formulario nuevo usuario / editar
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    roleId: '',
    branchId: 'principal',
    active: true,
    customPermissions: null
  });
  
  const [cloneFromUid, setCloneFromUid] = useState('');

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const data = snap.docs.map(doc => ({ ...doc.data(), uid: doc.id }));
      setUsers(data);
    });
    const unsubRoles = onSnapshot(collection(db, 'roles'), (snap) => {
      const data = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setRoles(data);
    });
    return () => { unsubUsers(); unsubRoles(); };
  }, []);

  const openNewUserModal = () => {
    setFormData({ name: '', email: '', password: '', roleId: '', branchId: 'principal', active: true, customPermissions: null });
    setCloneFromUid('');
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const handleClonePermissions = () => {
    if (!cloneFromUid) return;
    const userToClone = users.find(u => u.uid === cloneFromUid);
    if (!userToClone) return;
    
    let clonedPerms = null;
    if (userToClone.customPermissions) {
      clonedPerms = JSON.parse(JSON.stringify(userToClone.customPermissions));
    } else if (userToClone.roleId) {
      const roleToClone = roles.find(r => r.id === userToClone.roleId);
      if (roleToClone) {
        clonedPerms = JSON.parse(JSON.stringify(roleToClone.permissions));
      }
    }
    
    if (clonedPerms) {
      setFormData(prev => ({ ...prev, customPermissions: clonedPerms, roleId: '' }));
      alert('Permisos clonados exitosamente. Ahora puedes editarlos (Próximamente editor granular aquí).');
    }
  };

  const saveUser = async () => {
    if (!formData.name || !formData.email) return alert('Nombre y correo son obligatorios');
    if (!formData.roleId && !formData.customPermissions) return alert('Debes asignar un rol o permisos personalizados');

    try {
      if (selectedUser) {
        // Modo Edición: Actualizamos solo Firestore (no cambiamos password por seguridad aquí)
        await setDoc(doc(db, 'users', selectedUser.uid), {
          name: formData.name,
          email: formData.email,
          roleId: formData.roleId,
          branchId: formData.branchId,
          active: formData.active,
          customPermissions: formData.customPermissions,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        setIsModalOpen(false);
        alert('✅ Usuario actualizado.');
      } else {
        // Modo Creación: Llamamos al backend para crear credenciales reales
        if (!formData.password) return alert('La contraseña es obligatoria para usuarios nuevos');
        
        // Obtener el token del usuario actual para autorizar la petición
        const auth = await import('../../firebase/config').then(m => m.auth);
        if (!auth.currentUser) return alert('Sesión expirada');
        
        setIsCreating(true);
        try {
          const idToken = await auth.currentUser.getIdToken();
          
          console.log(`[API CALL] URL: /api/users/create | Method: POST`);
          const res = await fetch('/api/users/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ ...formData })
          });

          console.log(`[API RESPONSE] Status: ${res.status}`);
          const responseText = await res.text();
          console.log(`[API RESPONSE BODY]:\n${responseText.substring(0, 500)}...`);

          if (!res.ok) {
            let errorMsg = 'Error en el servidor.';
            try {
              const errJson = JSON.parse(responseText);
              errorMsg = errJson.error || errorMsg;
            } catch(e) {
              errorMsg = `El servidor devolvió un error no JSON (Status: ${res.status})`;
            }
            throw new Error(errorMsg);
          }

          const data = JSON.parse(responseText);
          alert('Usuario creado exitosamente.');
          
          // Registrar en auditoría
          try {
            const { addDoc, collection } = await import('firebase/firestore');
            await addDoc(collection(db, 'audit_logs'), {
              userName: auth.currentUser.email,
              uid: auth.currentUser.uid,
              timestamp: new Date().toISOString(),
              module: 'usuarios',
              action: 'CREATE',
              documentId: data.uid || formData.email,
              details: `Creó al usuario ${formData.email}`
            });
          } catch(e) { console.error("Error audibility:", e) }

          setFormData({ name: '', email: '', password: '', roleId: '', branchId: '', active: true, customPermissions: null });
          setIsCreating(false);
          setIsModalOpen(false);
        } catch (err) {
          setIsCreating(false);
          throw err;
        }
      }
    } catch (error) {
      console.error("Error guardando usuario", error);
      alert(`⚠️ Error: ${error.message}`);
    }
  };

  const toggleUserStatus = async (user) => {
    try {
      await setDoc(doc(db, 'users', user.uid), { active: !user.active }, { merge: true });
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <style>{`
        .cart-table th, .cart-table td {
          padding: 14px 20px !important;
          text-align: left;
          vertical-align: middle;
          white-space: nowrap;
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Gestión de Usuarios</h2>
        <button className="btn btn-primary" onClick={openNewUserModal} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Nuevo Usuario
        </button>
      </div>

      <div style={{ background: 'var(--bg-color)', borderRadius: '12px', overflow: 'hidden' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Sucursal</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No hay usuarios configurados aún. El super admin no aparece aquí.</td></tr>
            ) : users.map(u => (
              <tr key={u.uid}>
                <td style={{ fontWeight: 'bold' }}>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {u.customPermissions ? (
                    <span style={{ color: 'var(--accent)', fontSize: '0.85rem', padding: '4px 8px', background: 'rgba(128,128,128,0.1)', borderRadius: '12px' }}>
                      ✨ Personalizado
                    </span>
                  ) : (
                    roles.find(r => r.id === u.roleId)?.name || 'Sin rol'
                  )}
                </td>
                <td style={{ textTransform: 'capitalize' }}>{u.branchId}</td>
                <td>
                  <span style={{ 
                    color: u.active ? '#22c55e' : 'var(--danger-color)',
                    background: u.active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold'
                  }}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-icon" onClick={() => {
                      setSelectedUser(u);
                      setFormData({
                        name: u.name, email: u.email, roleId: u.roleId, branchId: u.branchId, active: u.active, customPermissions: u.customPermissions
                      });
                      setIsModalOpen(true);
                    }}>
                      <Edit2 size={18} />
                    </button>
                    <button className="btn-icon" onClick={() => toggleUserStatus(u)} title={u.active ? 'Desactivar' : 'Activar'}>
                      {u.active ? <UserX size={18} style={{ color: 'var(--danger-color)' }} /> : <UserCheck size={18} style={{ color: '#22c55e' }} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>{selectedUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Nombre Completo</label>
                <input style={{ width: '100%' }} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej: Juan Pérez" />
              </div>
              
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Correo Electrónico</label>
                <input style={{ width: '100%' }} type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="empleado@empresa.com" disabled={!!selectedUser} />
                {!!selectedUser && <small style={{ opacity: 0.6 }}>No puedes cambiar el correo de un usuario existente.</small>}
              </div>

              {!selectedUser && (
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Contraseña Inicial</label>
                  <input style={{ width: '100%' }} type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="********" />
                  <small style={{ opacity: 0.6 }}>El empleado podrá cambiarla después.</small>
                </div>
              )}

              {!selectedUser && (
                <div style={{ background: 'rgba(128,128,128,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.2)' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Copy size={16} /> Copiar permisos de otro usuario (Opcional)
                  </label>
                  <div className="form-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', color: 'var(--text-main)', border: '1px solid var(--panel-border)' }} value={cloneFromUid} onChange={e => setCloneFromUid(e.target.value)}>
                      <option value="">-- Seleccionar Usuario --</option>
                      {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                    </select>
                    <button className="btn-secondary" onClick={handleClonePermissions} disabled={!cloneFromUid}>Clonar</button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Rol del Sistema</label>
                <select 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', color: 'var(--text-main)', border: '1px solid var(--panel-border)' }} 
                  value={formData.roleId} 
                  onChange={e => setFormData({...formData, roleId: e.target.value, customPermissions: null})}
                  disabled={formData.customPermissions !== null}
                >
                  <option value="">-- Selecciona un Rol --</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name} {r.isSuperAdmin ? '(Control Total)' : ''}</option>)}
                </select>
                {formData.customPermissions !== null && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--accent)', marginTop: '0.5rem' }}>
                    Este usuario tiene permisos personalizados que sobrescriben el rol maestro.
                    <button onClick={() => setFormData({...formData, customPermissions: null})} style={{ marginLeft: '1rem', background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Borrar personalizados</button>
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button 
                  className="btn-primary" 
                  onClick={saveUser} 
                  disabled={isCreating}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isCreating ? 0.7 : 1 }}
                >
                  <Save size={18} /> {isCreating ? 'Guardando...' : 'Guardar Usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersScreen;
