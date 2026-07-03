import { getAdminDb } from '../../src/lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminDb = getAdminDb();
    
    // 1. Crear configuración de módulos
    await adminDb.collection('settings').doc('modulesConfig').set({
      modules: [
        { id: 'caja', label: 'Caja', actions: ['ver', 'crear', 'editar', 'eliminar', 'imprimir', 'exportar', 'anular', 'cobrar', 'descuentos'] },
        { id: 'inventario', label: 'Inventario', actions: ['ver', 'crear', 'editar', 'eliminar', 'imprimir', 'exportar', 'ajustar'] },
        { id: 'clientes', label: 'Clientes', actions: ['ver', 'crear', 'editar', 'eliminar', 'imprimir', 'exportar'] },
        { id: 'reportes', label: 'Reportes', actions: ['ver', 'crear', 'editar', 'eliminar', 'imprimir', 'exportar', 'ver_ventas', 'ver_utilidades'] },
        { id: 'configuracion', label: 'Administración', actions: ['ver', 'crear', 'editar', 'eliminar', 'imprimir', 'exportar'] },
        { id: 'usuarios', label: 'Usuarios (Submódulo)', actions: ['ver', 'crear', 'editar', 'eliminar'] },
        { id: 'roles', label: 'Roles (Submódulo)', actions: ['ver', 'crear', 'editar', 'eliminar'] },
        { id: 'auditoria', label: 'Auditoría (Submódulo)', actions: ['ver', 'exportar'] },
      ]
    });

    // 2. Crear Roles
    const roles = [
      {
        id: 'rol_admin',
        name: 'Administrador',
        isSuperAdmin: true,
        permissions: {} // SuperAdmin bypasses checks
      },
      {
        id: 'rol_cajero',
        name: 'Cajero',
        isSuperAdmin: false,
        permissions: {
          caja: { ver: true, cobrar: true, imprimir: true },
          clientes: { ver: true, crear: true, editar: true }
        }
      },
      {
        id: 'rol_inventario',
        name: 'Inventario',
        isSuperAdmin: false,
        permissions: {
          inventario: { ver: true, crear: true, editar: true, ajustar: true }
        }
      },
      {
        id: 'rol_supervisor',
        name: 'Supervisor',
        isSuperAdmin: false,
        permissions: {
          caja: { ver: true, anular: true, descuentos: true },
          inventario: { ver: true, exportar: true },
          reportes: { ver: true, ver_ventas: true }
        }
      },
      {
        id: 'rol_lectura',
        name: 'Solo lectura',
        isSuperAdmin: false,
        permissions: {
          caja: { ver: true },
          inventario: { ver: true },
          clientes: { ver: true },
          reportes: { ver: true, ver_ventas: true }
        }
      }
    ];

    const batch = adminDb.batch();
    roles.forEach(role => {
      const ref = adminDb.collection('roles').doc(role.id);
      batch.set(ref, role);
    });

    await batch.commit();

    res.status(200).json({ success: true, message: 'Base de datos inicializada correctamente con módulos y roles.' });
  } catch (error) {
    console.error('Error al inicializar BD:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
}
