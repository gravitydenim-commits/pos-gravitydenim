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
import { LayoutDashboard, Receipt, PackagePlus, Settings, LogOut, Loader2, Package, Users, AlertTriangle, Truck, Moon, Sun, Shield, Menu, X, Maximize2, Minimize2, Eye, EyeOff } from 'lucide-react';
import { auth, db } from './firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import './index.css';

const ADMIN_UID = 'AHo5ztrPExZndYJPIr1aByebMsN2';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' o 'ventas'
  const [authLoading, setAuthLoading] = useState(true);
  const [isLightTheme, setIsLightTheme] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isConcentrationMode, setIsConcentrationMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [currentView, setCurrentView] = useState('pos'); // 'pos', 'report', 'settings', 'inventory'
  const [salesDB, setSalesDB] = useState([]); 
  
  const [customersDB, setCustomersDB] = useState([]);
  const [productsDB, setProductsDB] = useState([]);

  const [companyData, setCompanyData] = useState({});
  const [issuers, setIssuers] = useState([]);
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

  // --- CONTROLES DE INTERFAZ (SIDEBAR, PANTALLA COMPLETA, CONCENTRACIÓN) ---
  useEffect(() => {
    // Detectar tamaño de pantalla al iniciar
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
      const savedState = localStorage.getItem('sidebar_collapsed');
      setIsSidebarCollapsed(savedState === 'true');
    } else {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebar_collapsed', String(newState));
      return newState;
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error('Error al entrar en pantalla completa:', err);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.error('Error al salir de pantalla completa:', err);
      });
    }
  };

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
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const qVentas = query(collection(db, 'ventas'), where('fechaTransaccion', '>=', thirtyDaysAgo.toISOString()));
        unsubVentas = onSnapshot(qVentas, (snapshot) => {
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
      console.error("Error al guardar cliente:", error);
      throw error;
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
    <div className={`app-layout ${isConcentrationMode ? 'concentration-active' : ''}`}>
      
      {/* HEADER GLOBAL */}
      <header className="desktop-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={toggleSidebar}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none'
            }}
            title={isSidebarCollapsed ? "Mostrar Menú" : "Ocultar Menú"}
          >
            {isSidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
          <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: '800', color: 'var(--accent)', letterSpacing: '0.5px' }}>
            GRAVITY DENIM POS
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Botón Modo Concentración */}
          <button
            onClick={() => setIsConcentrationMode(true)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: '#94a3b8',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              outline: 'none'
            }}
            title="Ocultar menú y cabecera"
          >
            <EyeOff size={16} /> Modo Concentración
          </button>

          {/* Botón Pantalla Completa */}
          <button
            onClick={toggleFullscreen}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: '#cbd5e1',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none'
            }}
            title={isFullscreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {(() => {
            const envVal = process.env.NEXT_PUBLIC_SRI_ENVIRONMENT;
            console.log('[SRI ENV CHECK] process.env.NEXT_PUBLIC_SRI_ENVIRONMENT:', envVal);
            const isProd = envVal === 'production';
            return (
              <span style={{ 
                fontSize: '0.8rem', 
                background: isProd ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', 
                color: isProd ? '#f87171' : '#f59e0b', 
                padding: '4px 10px', 
                borderRadius: '6px', 
                fontWeight: '900',
                border: isProd ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                letterSpacing: '0.5px',
                marginRight: '0.25rem'
              }}>
                {isProd ? 'SRI PRODUCCIÓN' : 'SRI PRUEBAS'}
              </span>
            );
          })()}

          <span style={{ fontSize: '0.8rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent)', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
            {isAdmin ? '🛡️ Admin' : '👤 Ventas'}
          </span>
        </div>
      </header>

      {/* BOTÓN FLOTANTE DISCRETO PARA SALIR DEL MODO CONCENTRACIÓN */}
      {isConcentrationMode && (
        <button
          onClick={() => setIsConcentrationMode(false)}
          style={{
            position: 'fixed',
            top: '10px',
            left: '10px',
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            color: '#3b82f6',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(5px)'
          }}
        >
          <Eye size={14} /> Salir Modo Concentración
        </button>
      )}

      {/* CONTENEDOR INFERIOR DE LAYOUT */}
      <div className={`app-body ${isConcentrationMode ? 'concentration-active' : ''}`}>
        
        {/* Sidebar Navigation */}
        <nav className={`sidebar glass-panel ${isSidebarCollapsed || isConcentrationMode ? 'collapsed' : ''}`}>
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
      </div>

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
