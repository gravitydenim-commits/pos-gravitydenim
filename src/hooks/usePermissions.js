import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * usePermissions — Hook RBAC puro.
 *
 * DISEÑO:
 * - Nunca compara nombres de roles ("Administrador", "Vendedor", etc.).
 * - Resuelve los permisos efectivos del usuario desde Firestore:
 *     1. customPermissions del usuario (prioridad máxima)
 *     2. permissions del rol asignado (roleId → roles/{roleId})
 *     3. {} si no hay permisos
 * - `isAdmin` es true solo si los permisos efectivos contienen { superadmin: true }.
 * - El único bypass por UID es para el super admin de emergencia (recuperación de acceso).
 *
 * Para crear un rol con acceso total: asignarle { superadmin: true } en Firestore.
 * Para un rol "Supervisor" con acceso parcial: asignarle solo los módulos que necesita.
 * NUNCA modificar este hook para añadir lógica basada en nombres de roles.
 */
export function usePermissions(user) {
  const [permissions, setPermissions] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modulesConfig, setModulesConfig] = useState(null);

  useEffect(() => {
    if (!user) {
      setPermissions(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let unsubRole = null;

    // Cargar la configuración dinámica de módulos
    const unsubModules = onSnapshot(doc(db, 'settings', 'modulesConfig'), (docSnap) => {
      if (docSnap.exists()) {
        setModulesConfig(docSnap.data().modules);
      } else {
        setModulesConfig([
          { id: 'caja',          label: 'Caja',          actions: ['ver', 'cobrar', 'anular', 'reimprimir', 'descuentos'] },
          { id: 'inventario',    label: 'Inventario',    actions: ['ver', 'crear', 'editar', 'eliminar', 'ajustar', 'exportar'] },
          { id: 'clientes',      label: 'Clientes',      actions: ['ver', 'crear', 'editar', 'eliminar'] },
          { id: 'reportes',      label: 'Reportes',      actions: ['ver_ventas', 'ver_utilidades', 'exportar', 'imprimir'] },
          { id: 'configuracion', label: 'Configuración', actions: ['ver', 'editar'] },
          { id: 'auditoria',     label: 'Auditoría',     actions: ['ver'] },
          { id: 'roles',         label: 'Roles',         actions: ['ver', 'editar'] },
          { id: 'usuarios',      label: 'Usuarios',      actions: ['ver', 'editar'] },
        ]);
      }
    }, (error) => {
      console.error('ERROR en [settings/modulesConfig]:', error);
    });

    // UID de emergencia — solo para recuperación si el documento Firestore del super admin
    // es eliminado accidentalmente. Configurar en variables de entorno del cliente si se desea.
    // En producción, este usuario debe tener su documento Firestore con { superadmin: true }.
    const EMERGENCY_UID = process.env.NEXT_PUBLIC_SUPER_ADMIN_UID;

    // Escuchar el documento del usuario en tiempo real
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), async (userSnap) => {
      // Fallback de emergencia: si el UID coincide y no hay documento Firestore
      if (!userSnap.exists() && EMERGENCY_UID && user.uid === EMERGENCY_UID) {
        setPermissions({ superadmin: true });
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      if (!userSnap.exists()) {
        setPermissions({});
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const userData = userSnap.data();

      // Limpiar listener de rol previo si existe
      if (unsubRole) {
        unsubRole();
        unsubRole = null;
      }

      const updatePermissions = (roleData) => {
        let effectivePerms = {};
        // 1. Permisos personalizados (tienen prioridad sobre el rol)
        if (userData.customPermissions && Object.keys(userData.customPermissions).length > 0) {
          effectivePerms = userData.customPermissions;
        }
        // 2. Permisos del rol asignado
        else if (roleData) {
          effectivePerms = roleData.permissions || {};
        }

        const isSuperAdmin = effectivePerms.superadmin === true;
        setPermissions(effectivePerms);
        setIsAdmin(isSuperAdmin);
        setLoading(false);
      };

      if (userData.roleId) {
        unsubRole = onSnapshot(doc(db, 'roles', userData.roleId), (roleSnap) => {
          updatePermissions(roleSnap.exists() ? roleSnap.data() : null);
        });
      } else {
        updatePermissions(null);
      }
    }, (error) => {
      console.error('ERROR en [users]:', error);
      // En caso de error de red, aplicar permisos vacíos (principio de mínimo privilegio)
      const isEmergency = EMERGENCY_UID && user.uid === EMERGENCY_UID;
      setPermissions(isEmergency ? { superadmin: true } : {});
      setIsAdmin(isEmergency);
      setLoading(false);
    });

    return () => {
      unsubModules();
      unsubUser();
      if (unsubRole) unsubRole();
    };
  }, [user]);

  /**
   * Verifica si el usuario tiene un permiso específico.
   * - Si isAdmin (superadmin: true) → siempre true.
   * - Si no → busca permissions[module][action] === true.
   */
  const hasPermission = useCallback((module, action) => {
    if (isAdmin) return true;
    if (!permissions) return false;
    return permissions[module]?.[action] === true;
  }, [isAdmin, permissions]);

  return { permissions, isAdmin, loading, modulesConfig, hasPermission };
}
