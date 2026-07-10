"use client";
import React, { useState, useEffect } from 'react';
import POSScreen from './components/POS/POSScreen';
import ReportesDashboard from './components/Reports/ReportesDashboard';
import AgregarProductoModal from './components/Products/AgregarProductoModal';
import InventarioScreen from './components/Products/InventarioScreen';
import ClientesScreen from './components/Customers/ClientesScreen';
import AgregarClienteModal from './components/Customers/AgregarClienteModal';
import ConfiguracionGeneral from './components/Settings/ConfiguracionGeneral';
import LoginScreen from './components/Auth/LoginScreen';
import FacturasSRI from './components/Contingencia/FacturasSRI';
import AdminScreen from './components/Admin/AdminScreen';
import { usePermissions } from './hooks/usePermissions';
import { LayoutDashboard, Receipt, PackagePlus, Settings, LogOut, Loader2, Package, Users, AlertTriangle, Truck, Moon, Sun, Shield } from 'lucide-react';
import { auth, db } from './firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import './index.css';

// --- MOCK DATABASE (Simulando Firebase) ---
const MOCK_ISSUERS = [
  { id: 'hermano_geovanny', ruc: '1803805405001', name: 'Edgar Geovanny Sanchez Ramirez', p12Name: '', correo: 'gravitydenim@gmail.com', direccionMatriz: 'Av. Maldonado y Quimiag', obligadoContabilidad: false },
  { id: 'hermano_maria', ruc: '0900000002001', name: 'María Pérez', p12Name: '', correo: 'maria@gravitydenim.com', direccionMatriz: 'N/A', obligadoContabilidad: false },
  { id: 'hermano_carlos', ruc: '0900000003001', name: 'Carlos Pérez', p12Name: '', correo: 'carlos@gravitydenim.com', direccionMatriz: 'N/A', obligadoContabilidad: false },
];

const INITIAL_COMPANY_DATA = {
  razonSocial: 'Gravity Denim Cia. Ltda.',
  ruc: '0999999999001',
  direccionMatriz: 'Av. Principal y Secundaria, Guayaquil',
  correo: 'info@gravitydenim.com',
  obligadoContabilidad: true
};

const ADMIN_UID = 'AHo5ztrPExZndYJPIr1aByebMsN2';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' o 'ventas'
  const [authLoading, setAuthLoading] = useState(true);
  const [isLightTheme, setIsLightTheme] = useState(false);

  const [currentView, setCurrentView] = useState('pos'); // 'pos', 'report', 'settings', 'inventory'
  const [salesDB, setSalesDB] = useState([]); 
  
  const [customersDB, setCustomersDB] = useState([]);
  const [productsDB, setProductsDB] = useState([]);

  const [companyData, setCompanyData] = useState(INITIAL_COMPANY_DATA);
  const [issuers, setIssuers] = useState(MOCK_ISSUERS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);
  const [customerToEdit, setCustomerToEdit] = useState(null);

  // --- ESCUCHAR ESTADO DE AUTENTICACIÓN Y SINCRONIZAR FIRESTORE ---
  useEffect(() => {
    // Inicializar tema desde localStorage
    const savedTheme = localStorage.getItem('isLightTheme');
    if (savedTheme === 'true') {
      setIsLightTheme(true);
      document.body.classList.add('light-theme');
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setUserRole(user.uid === ADMIN_UID ? 'admin' : 'ventas');
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setCustomersDB([]);
        setProductsDB([]);
        setSalesDB([]);
      }
      setAuthLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 🔴 INYECTAR HOOK DE PERMISOS AQUI PARA USARLO EN LAS SUSCRIPCIONES
  const { permissions, isAdmin, loading: permissionsLoading, modulesConfig, hasPermission } = usePermissions(currentUser);

  // --- SUSCRIPCIONES A FIRESTORE BASADAS EN PERMISOS ---
  useEffect(() => {
    let unsubClientes;
    let unsubProductos;
    let unsubVentas;
    let unsubIssuers;

    if (currentUser && !permissionsLoading) {
      if (isAdmin || hasPermission('clientes', 'ver')) {
        unsubClientes = onSnapshot(collection(db, 'clientes'), (snapshot) => {
          const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
          setCustomersDB(data);
        }, (err) => console.error(`ERROR EN [clientes] (uid=${currentUser.uid}, rol=${userRole}):`, err));
      }

      if (isAdmin || hasPermission('inventario', 'ver')) {
        unsubProductos = onSnapshot(collection(db, 'productos'), (snapshot) => {
          const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
          setProductsDB(data);
        }, (err) => console.error(`ERROR EN [productos] (uid=${currentUser.uid}, rol=${userRole}):`, err));
      }

      if (isAdmin || hasPermission('caja', 'ver')) {
        unsubVentas = onSnapshot(collection(db, 'ventas'), (snapshot) => {
          const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
          setSalesDB(data);
        }, (err) => console.error(`ERROR EN [ventas] (uid=${currentUser.uid}, rol=${userRole}):`, err));
      }



      unsubIssuers = onSnapshot(collection(db, 'issuers'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        if (data.length > 0) {
          setIssuers(data);
        } else {
          setIssuers(MOCK_ISSUERS);
        }
      }, (err) => console.error(`ERROR EN [issuers] (uid=${currentUser.uid}, rol=${userRole}):`, err));

    }

    return () => {
      if (unsubClientes) unsubClientes();
      if (unsubProductos) unsubProductos();
      if (unsubVentas) unsubVentas();
      if (unsubIssuers) unsubIssuers();
    };
  }, [currentUser, permissionsLoading, isAdmin, permissions, hasPermission, userRole]);



  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentView('pos'); // Resetear vista
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  };

  const toggleTheme = () => {
    setIsLightTheme(prev => {
      const newValue = !prev;
      localStorage.setItem('isLightTheme', newValue);
      if (newValue) {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
      return newValue;
    });
  };

  const recordSale = async (saleData) => {
    try {
      await addDoc(collection(db, 'ventas'), saleData);
    } catch (error) {
      console.error("Error al registrar venta", error);
    }
  };



  const recordCustomer = async (customerData) => {
    if (customerData.tipoDocumento === 'CONSUMIDOR_FINAL' || !customerData.numeroIdentificacion) return;
    try {
      await setDoc(doc(db, 'clientes', customerData.numeroIdentificacion), customerData);
    } catch (error) {
      console.error("Error al guardar cliente en venta", error);
    }
  };

  const handleSaveProduct = async (productoData, isEditing) => {
    try {
      if (isEditing) {
        await setDoc(doc(db, 'productos', productoData.id), productoData);
      } else {
        const { id, ...dataToSave } = productoData; // Remove dummy id if exists
        await addDoc(collection(db, 'productos'), dataToSave);
      }
    } catch (error) {
      console.error("Error al guardar producto", error);
    }
  };

  const eliminarProducto = async (id) => {
    try {
      await deleteDoc(doc(db, 'productos', id));
    } catch (error) {
      console.error("Error eliminando producto", error);
    }
  };

  const eliminarCliente = async (numeroIdentificacion) => {
    try {
      await deleteDoc(doc(db, 'clientes', numeroIdentificacion));
    } catch (error) {
      console.error("Error eliminando cliente", error);
    }
  };

  const handleSaveCustomer = async (clienteData, isEditing = false) => {
    try {
      if (!isEditing) {
        // Prevent duplicates on creation
        const exists = customersDB.some(c => c.numeroIdentificacion === clienteData.numeroIdentificacion);
        if (exists) {
          throw new Error("Ya existe un cliente registrado con esta Identificación.");
        }
      }
      await setDoc(doc(db, 'clientes', clienteData.numeroIdentificacion), clienteData);
    } catch (error) {
      console.error("Error guardando cliente", error);
      throw error;
    }
  };

  const saveCompanyData = (newData) => {
    setCompanyData(newData);
    alert("✅ Datos de la empresa actualizados.");
  };

  const updateIssuer = (issuerId, newData) => {
    setIssuers(prev => prev.map(i => i.id === issuerId ? { ...i, ...newData } : i));
  };

  // (Hook movido hacia arriba para que esté disponible en el useEffect de suscripciones)
  // Pantalla de carga mientras Firebase verifica sesión o permisos
  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-color)', color: 'var(--accent)' }}>
        <Loader2 size={48} className="animate-spin" />
      </div>
    );
  }

  // Si no hay usuario autenticado, forzar Login
  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <nav className="sidebar glass-panel">
        <div className="sidebar-main-nav">
          <div className="sidebar-logo">
            <img src="/logo.jpg" alt="GD" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
          </div>
          
          <button 
            className={`nav-btn ${currentView === 'pos' ? 'active' : ''}`}
            onClick={() => setCurrentView('pos')}
          >
            <Receipt size={24} />
            <span className="nav-btn-text">Caja</span>
          </button>
          
          {isAdmin && (
            <>
              <button 
                className={`nav-btn ${currentView === 'inventory' ? 'active' : ''}`}
                onClick={() => setCurrentView('inventory')}
              >
                <Package size={24} />
                <span className="nav-btn-text">Inventario</span>
              </button>

              <button 
                className={`nav-btn ${currentView === 'customers' ? 'active' : ''}`}
                onClick={() => setCurrentView('customers')}
              >
                <Users size={24} />
                <span className="nav-btn-text">Clientes</span>
              </button>

              <button 
                className={`nav-btn ${currentView === 'report' ? 'active' : ''}`}
                onClick={() => setCurrentView('report')}
              >
                <LayoutDashboard size={24} />
                <span className="nav-btn-text">Reportes</span>
              </button>
            </>
          )}

          <button 
            className={`nav-btn ${currentView === 'sri' ? 'active' : ''}`}
            onClick={() => setCurrentView('sri')}
          >
            <AlertTriangle size={24} />
            <span className="nav-btn-text">Facturas SRI</span>
          </button>



          {isAdmin && (
            <>
              <button 
                className={`nav-btn ${currentView === 'admin' ? 'active' : ''}`}
                onClick={() => setCurrentView('admin')}
              >
                <Shield size={24} />
                <span className="nav-btn-text">Admin</span>
              </button>

              <button 
                className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`}
                onClick={() => setCurrentView('settings')}
              >
                <Settings size={24} />
                <span className="nav-btn-text">Ajustes</span>
              </button>

              <hr className="sidebar-divider" />

              <button 
                className="nav-btn nav-btn-add"
                onClick={() => { setProductToEdit(null); setIsModalOpen(true); }}
              >
                <PackagePlus size={24} />
                <span className="nav-btn-text">+ Producto</span>
              </button>
            </>
          )}
        </div>

        {/* User Info, Theme & Logout */}
        <div className="sidebar-user-nav" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
          <div className="user-role-badge">
            <span>{isAdmin ? '🛡️ Admin' : '👤 Ventas'}</span>
          </div>

          <button 
            className="nav-btn"
            onClick={toggleTheme}
            style={{ color: 'var(--text-muted)' }}
          >
            {isLightTheme ? <Moon size={24} /> : <Sun size={24} />}
            <span className="nav-btn-text">{isLightTheme ? 'Tema Noche' : 'Tema Día'}</span>
          </button>

          <button 
            className="nav-btn nav-btn-logout"
            onClick={() => signOut(auth)}
            title="Cerrar Sesión"
          >
            <LogOut size={24} />
            <span className="nav-btn-text">Salir</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {currentView === 'pos' && (
          <POSScreen 
            issuers={issuers} 
            productsDB={productsDB}
            salesDB={salesDB}
            recordSale={recordSale} 
            customersDB={customersDB}
            recordCustomer={recordCustomer}
          />
        )}
        {currentView === 'admin' && isAdmin && (
          <AdminScreen permissions={permissions} modulesConfig={modulesConfig} isSuperAdmin={isAdmin} />
        )}
        {(currentView === 'report' && hasPermission('reportes', 'ver_ventas')) && (
          <ReportesDashboard issuers={issuers} sales={salesDB} />
        )}
        {(currentView === 'sri' && isAdmin) && (
          <FacturasSRI />
        )}

        {(currentView === 'settings' && isAdmin) && (
          <ConfiguracionGeneral 
            companyData={companyData} 
            saveCompanyData={saveCompanyData} 
            issuers={issuers} 
            updateIssuer={updateIssuer} 
          />
        )}
        {(currentView === 'inventory' && hasPermission('inventario', 'ver')) && (
          <InventarioScreen 
            productsDB={productsDB}
            onEdit={(prod) => { setProductToEdit(prod); setIsModalOpen(true); }}
            onDelete={eliminarProducto}
            onAdd={() => { setProductToEdit(null); setIsModalOpen(true); }}
          />
        )}
        {(currentView === 'customers' && hasPermission('clientes', 'ver')) && (
          <ClientesScreen 
            customersDB={customersDB}
            onAdd={() => { setCustomerToEdit(null); setIsCustomerModalOpen(true); }}
            onEdit={(cliente) => { setCustomerToEdit(cliente); setIsCustomerModalOpen(true); }}
            onDelete={eliminarCliente}
          />
        )}
      </main>

      {/* Modal Agregar/Editar Producto */}
      {(isModalOpen && isAdmin) && (
        <AgregarProductoModal 
          initialData={productToEdit}
          onClose={() => { setIsModalOpen(false); setProductToEdit(null); }} 
          onSave={handleSaveProduct} 
        />
      )}

      {/* Modal Agregar/Editar Cliente */}
      {(isCustomerModalOpen && isAdmin) && (
        <AgregarClienteModal 
          initialData={customerToEdit}
          onClose={() => { setIsCustomerModalOpen(false); setCustomerToEdit(null); }} 
          onSave={recordCustomer} 
        />
      )}
    </div>
  );
}

export default App;
