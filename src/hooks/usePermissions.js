import { useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export function usePermissions(user) {
  const [permissions, setPermissions] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modulesConfig, setModulesConfig] = useState(null);

  useEffect(() => {
    // 1. Cargar la configuración dinámica de módulos
    const unsubModules = onSnapshot(doc(db, 'settings', 'modulesConfig'), (docSnap) => {
      if (docSnap.exists()) {
        setModulesConfig(docSnap.data().modules);
      } else {
        // Fallback por defecto si no existe en BD aún
        setModulesConfig([
          { id: 'caja', label: 'Caja', actions: ['ver', 'cobrar', 'anular', 'reimprimir', 'descuentos'] },
          { id: 'inventario', label: 'Inventario', actions: ['ver', 'crear', 'editar', 'eliminar', 'ajustar', 'exportar'] },
          { id: 'clientes', label: 'Clientes', actions: ['ver', 'crear', 'editar', 'eliminar'] },
          { id: 'reportes', label: 'Reportes', actions: ['ver_ventas', 'ver_utilidades', 'exportar', 'imprimir'] },
          { id: 'configuracion', label: 'Configuración', actions: ['ver', 'editar'] },
          { id: 'auditoria', label: 'Auditoría', actions: ['ver'] },
          { id: 'roles', label: 'Roles', actions: ['ver', 'editar'] },
          { id: 'usuarios', label: 'Usuarios', actions: ['ver', 'editar'] },
        ]);
      }
    });

    if (!user) {
      setPermissions(null);
      setIsAdmin(false);
      setLoading(false);
      return () => unsubModules();
    }

    // El super admin fallback
    const SUPER_ADMIN_UID = 'AHo5ztrPExZndYJPIr1aByebMsN2';
    
    // 2. Escuchar el documento del usuario
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), async (userSnap) => {
      let finalPerms = {};
      let isAd = user.uid === SUPER_ADMIN_UID;

      if (userSnap.exists()) {
        const userData = userSnap.data();
        
        // Si tiene permisos customizados, los usamos directamente
        if (userData.customPermissions && Object.keys(userData.customPermissions).length > 0) {
          finalPerms = userData.customPermissions;
        } 
        // Si tiene un rol, buscamos los permisos de ese rol
        else if (userData.roleId) {
          const roleSnap = await getDoc(doc(db, 'roles', userData.roleId));
          if (roleSnap.exists()) {
            finalPerms = roleSnap.data().permissions || {};
            if (roleSnap.data().name === 'Administrador' || roleSnap.data().name === 'Admin') {
              isAd = true;
            }
          }
        }
      } else if (user.uid === SUPER_ADMIN_UID) {
        // Fallback para el super admin si no tiene documento
        isAd = true;
        // Le damos permisos infinitos temporalmente en UI
      }

      setPermissions(finalPerms);
      setIsAdmin(isAd);
      setLoading(false);
    });

    return () => {
      unsubModules();
      unsubUser();
    };
  }, [user]);

  // Función helper para chequear permiso rápido
  const hasPermission = (module, action) => {
    if (isAdmin) return true; // Admin todo lo puede en UI
    if (!permissions) return false;
    return permissions[module]?.[action] === true;
  };

  return { permissions, isAdmin, loading, modulesConfig, hasPermission };
}
