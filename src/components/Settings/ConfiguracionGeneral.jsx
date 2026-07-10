import React, { useState, useEffect } from 'react';
import { Save, UploadCloud, FileKey, ShieldCheck, Loader2 } from 'lucide-react';
import { db, storage } from '../../firebase/config';
import { collection, onSnapshot, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

export default function ConfiguracionGeneral() {
  // --- PREFERENCIAS DE IMPRESIÓN ---
  const [printFormat, setPrintFormat] = useState('80mm');
  const [printMethod, setPrintMethod] = useState('sistema');

  useEffect(() => {
    // Cargar preferencias
    const savedFormat = localStorage.getItem('printerFormat');
    const savedMethod = localStorage.getItem('printerMethod');
    if (savedFormat) setPrintFormat(savedFormat);
    if (savedMethod) setPrintMethod(savedMethod);
  }, []);

  const handlePrintPreferenceChange = (key, value) => {
    if (key === 'format') {
      setPrintFormat(value);
      localStorage.setItem('printerFormat', value);
    } else {
      setPrintMethod(value);
      localStorage.setItem('printerMethod', value);
    }
  };

  // --- PANTALLA SECUNDARIA (iMin D4-504) ---
  const [csEnabled, setCsEnabled] = useState(false);
  const [csWelcomeType, setCsWelcomeType] = useState('logo_msg');
  const [csMessage, setCsMessage] = useState('Bienvenidos a Gravity Denim');
  const [csShowTotal, setCsShowTotal] = useState(true);
  const [csShowQR, setCsShowQR] = useState(true);

  useEffect(() => {
    const savedEnabled = localStorage.getItem('csEnabled');
    const savedType = localStorage.getItem('csWelcomeType');
    const savedMsg = localStorage.getItem('csMessage');
    const savedTotal = localStorage.getItem('csShowTotal');
    const savedQR = localStorage.getItem('csShowQR');

    if (savedEnabled !== null) setCsEnabled(savedEnabled === 'true');
    if (savedType) setCsWelcomeType(savedType);
    if (savedMsg) setCsMessage(savedMsg);
    if (savedTotal !== null) setCsShowTotal(savedTotal === 'true');
    if (savedQR !== null) setCsShowQR(savedQR === 'true');
  }, []);

  const handleCsChange = (key, value) => {
    localStorage.setItem(key, value);
    switch(key) {
      case 'csEnabled': setCsEnabled(value); break;
      case 'csWelcomeType': setCsWelcomeType(value); break;
      case 'csMessage': setCsMessage(value); break;
      case 'csShowTotal': setCsShowTotal(value); break;
      case 'csShowQR': setCsShowQR(value); break;
    }
  };

  // --- CÓDIGOS QR DE TRANSFERENCIAS ---
  const [transferQrs, setTransferQrs] = useState({
    Edgar: null,
    Amparito: null,
    Junior: null,
    Diana: null
  });
  const [uploadingQRFor, setUploadingQRFor] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'transfer_qrs'), (docSnap) => {
      if (docSnap.exists()) {
        setTransferQrs({
          Edgar: docSnap.data().Edgar || null,
          Amparito: docSnap.data().Amparito || null,
          Junior: docSnap.data().Junior || null,
          Diana: docSnap.data().Diana || null
        });
      }
    });
    return () => unsub();
  }, []);

  const handleQRUpload = async (person, e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Por favor selecciona una imagen válida.");
      return;
    }

    setUploadingQRFor(person);
    try {
      // Create a reference in Firebase Storage
      const qrRef = ref(storage, `qrs/${person}_qr_${Date.now()}`);
      const uploadTask = uploadBytesResumable(qrRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {}, // progress
        (error) => {
          console.error("Error subiendo QR:", error);
          alert("Error subiendo QR.");
          setUploadingQRFor(null);
        },
        async () => {
          // Success
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          // Save to Firestore
          await setDoc(doc(db, 'settings', 'transfer_qrs'), {
            [person]: downloadURL
          }, { merge: true });
          
          setUploadingQRFor(null);
          alert(`QR de ${person} guardado con éxito.`);
        }
      );
    } catch (err) {
      console.error(err);
      alert("Error iniciando la subida.");
      setUploadingQRFor(null);
    }
  };

  const handleQRRemove = async (person) => {
    if (!window.confirm(`¿Estás seguro de eliminar el QR de ${person}?`)) return;
    
    try {
      await setDoc(doc(db, 'settings', 'transfer_qrs'), {
        [person]: null
      }, { merge: true });
    } catch (e) {
      console.error("Error removiendo QR", e);
    }
  };

  const [emisoresDB, setEmisoresDB] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssuer, setSelectedIssuer] = useState(() => localStorage.getItem('emisor_config') || '');
  
  // Estado local para el formulario del emisor seleccionado
  const [formData, setFormData] = useState({
    ruc: '',
    nombre: '',
    direccion: '',
    correo: '',
    obligadoContabilidad: false,
    passwordP12: '',
    file: null,
    fileName: '',
    estab: '001',
    ptoEmi: '001',
    secuencial: '1'
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // --- LEER DATOS EN TIEMPO REAL DESDE FIRESTORE ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'issuers'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setEmisoresDB(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // --- SINCRONIZAR SELECCIÓN Y DATOS ---
  useEffect(() => {
    if (emisoresDB.length >= 0 && !loading) {
      let currentSelection = selectedIssuer;
      
      // Auto-selección si está vacío
      if (!currentSelection) {
        currentSelection = "hermano_geovanny"; 
        setSelectedIssuer(currentSelection);
        localStorage.setItem('emisor_config', currentSelection);
      }

      // Llenar datos (solo si no se está editando activamente)
      const existing = emisoresDB.find(i => i.id === currentSelection);
      if (existing) {
        setFormData(prev => ({
          ...prev,
          ruc: prev.ruc || existing.ruc || '', // Respeta si el usuario ya escribió algo
          nombre: prev.nombre || existing.name || '',
          direccion: prev.direccion || existing.direccionMatriz || '',
          correo: prev.correo || existing.correo || '',
          obligadoContabilidad: existing.obligadoContabilidad !== undefined ? existing.obligadoContabilidad : prev.obligadoContabilidad,
          passwordP12: prev.passwordP12 || '********',
          fileName: prev.fileName || existing.p12Name || '',
          estab: prev.estab || existing.estab || '001',
          ptoEmi: prev.ptoEmi || existing.ptoEmi || '001',
          secuencial: prev.secuencial || existing.secuencial || '1'
        }));
      }
    }
  }, [emisoresDB, loading, selectedIssuer]);

  // Manejar el cambio de hermano en el selector
  const handleIssuerSelect = (e) => {
    const issuerId = e.target.value;
    setSelectedIssuer(issuerId);
    localStorage.setItem('emisor_config', issuerId);
    
    // Resetear formulario para forzar recarga del nuevo
    setFormData({
      ruc: '',
      nombre: '',
      direccion: '',
      correo: '',
      obligadoContabilidad: false,
      passwordP12: '',
      file: null,
      fileName: '',
      estab: '001',
      ptoEmi: '001',
      secuencial: '1'
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.p12')) {
      setFormData(prev => ({ 
        ...prev, 
        file: file,
        fileName: file.name
      }));
    } else {
      alert("Por favor, selecciona un archivo válido con extensión .p12");
      e.target.value = '';
    }
  };

  // --- UPLOAD A LA BÓVEDA EN EL BACKEND ---
  const uploadToVault = async (file, password) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = reader.result.split(',')[1];
          const { getAuth } = await import('firebase/auth');
          const auth = getAuth();
          const idToken = await auth.currentUser.getIdToken();

          const response = await fetch('/api/admin/issuers/save-secret', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              issuerId: selectedIssuer,
              p12Base64: base64Data,
              password: password
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Error al guardar el secreto.');
          }
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleSaveConfiguration = async (e) => {
    e.preventDefault();
    if (!selectedIssuer) {
      alert("Selecciona un hermano primero.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      let p12DownloadUrl = "";

      // 1. Subir archivo .p12 a la bóveda (si se seleccionó uno nuevo)
      if (formData.file) {
        console.log(`📤 [Seguridad] Guardando firma ${formData.fileName} en la Bóveda...`);
        // Simular progreso rápido para el UI
        setUploadProgress(50);
        await uploadToVault(formData.file, formData.passwordP12);
        setUploadProgress(100);
        console.log(`✅ [Seguridad] Firma cifrada en la bóveda correctamente.`);
      }

      // 2. Guardar/Actualizar en Firestore en la colección 'issuers'
      const existingIssuer = emisoresDB.find(i => i.id === selectedIssuer);
      const issuerDocUpdate = {
        ruc: formData.ruc,
        name: formData.nombre,
        direccionMatriz: formData.direccion,
        correo: formData.correo,
        obligadoContabilidad: formData.obligadoContabilidad,
        passwordP12: formData.passwordP12 !== '********' ? formData.passwordP12 : existingIssuer?.passwordP12 || '', // Mantener la anterior si no cambió
        p12Url: p12DownloadUrl || existingIssuer?.p12Url || '', // Guardar la ruta del storage
        p12Name: formData.fileName || existingIssuer?.p12Name || '',
        estab: formData.estab,
        ptoEmi: formData.ptoEmi,
        secuencial: parseInt(formData.secuencial, 10) || 1
      };

      console.log(`💾 [Firestore] Actualizando documento en colección 'issuers' para ID: ${selectedIssuer}`);
      await setDoc(doc(db, 'issuers', selectedIssuer), issuerDocUpdate, { merge: true });

      alert(`✅ Configuración fiscal de ${formData.nombre} guardada exitosamente en Firebase.`);
      
    } catch (error) {
      console.error("❌ Error guardando configuración:", error);
      alert("Error guardando la configuración.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="report-container animate-fade-in" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2><ShieldCheck className="inline" style={{verticalAlign: 'bottom'}}/> Configuración de Emisores SRI</h2>
        <span style={{color: 'var(--text-muted)'}}>Firmas Electrónicas (.p12) y Perfiles Multi-RUC</span>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ padding: '2rem' }}>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--accent)' }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 1rem auto' }} />
              <p>Cargando datos desde Firebase...</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Seleccionar Perfil Fiscal:</label>
                <select 
                  value={selectedIssuer} 
                  onChange={handleIssuerSelect}
                  style={{ width: '100%', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--accent)', color: 'var(--text-main)', borderRadius: '8px', fontSize: '1rem' }}
                >
                  <option value="" disabled>-- Elige un Perfil --</option>
                  <option value="hermano_geovanny">Geovanny Sanchez</option>
                  <option value="hermano_maria">María Pérez</option>
                  <option value="hermano_carlos">Carlos Pérez</option>
                </select>
              </div>

          {selectedIssuer && (
            <form onSubmit={handleSaveConfiguration} className="animate-fade-in">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>RUC del Emisor</label>
                  <input 
                    type="text" 
                    name="ruc" 
                    value={formData.ruc} 
                    onChange={handleInputChange} 
                    placeholder="13 dígitos"
                    required
                    style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '1rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Razón Social / Nombre Comercial</label>
                  <input 
                    type="text" 
                    name="nombre" 
                    value={formData.nombre} 
                    onChange={handleInputChange} 
                    required
                    style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '1rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Dirección Matriz</label>
                <input 
                  type="text" 
                  name="direccion" 
                  value={formData.direccion} 
                  onChange={handleInputChange} 
                  placeholder="Av. Principal y Secundaria..."
                  required
                  style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '1rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Correo Electrónico Matriz</label>
                <input 
                  type="email" 
                  name="correo" 
                  value={formData.correo} 
                  onChange={handleInputChange} 
                  placeholder="correo@ejemplo.com"
                  required
                  style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '1rem' }}
                />
              </div>


              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Establecimiento</label>
                  <input 
                    type="text" 
                    name="estab"
                    value={formData.estab}
                    onChange={handleInputChange}
                    placeholder="001"
                    required
                    style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '1rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Pto. Emisión</label>
                  <input 
                    type="text" 
                    name="ptoEmi"
                    value={formData.ptoEmi}
                    onChange={handleInputChange}
                    placeholder="001"
                    required
                    style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '1rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Secuencial Actual</label>
                  <input 
                    type="number" 
                    name="secuencial"
                    value={formData.secuencial}
                    onChange={handleInputChange}
                    placeholder="1"
                    required
                    style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '1rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="obligado" 
                  name="obligadoContabilidad"
                  checked={formData.obligadoContabilidad}
                  onChange={handleInputChange}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="obligado" style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Obligado a llevar contabilidad
                </label>
              </div>

              <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px dashed var(--accent)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>
                <FileKey size={40} color="var(--accent)" style={{ marginBottom: '0.5rem' }} />
                <h4 style={{ marginBottom: '0.5rem' }}>Archivo de Firma Electrónica (.p12)</h4>
                {formData.fileName && <p style={{ color: 'var(--success)', marginBottom: '1rem', fontSize: '0.9rem' }}>Seleccionado: {formData.fileName}</p>}
                
                <input 
                  type="file" 
                  id="p12Upload" 
                  accept=".p12" 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }}
                />
                <label htmlFor="p12Upload" className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer', background: 'var(--panel-border)' }}>
                  <UploadCloud className="inline" size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }}/> 
                  Seleccionar Archivo .p12
                </label>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Contraseña de la Firma Electrónica</label>
                <input 
                  type="password" 
                  name="passwordP12" 
                  value={formData.passwordP12} 
                  onChange={handleInputChange} 
                  placeholder="Escriba la clave secreta del .p12"
                  required
                  style={{ width: '100%', padding: '10px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)' }}
                />
                <small style={{ color: 'var(--danger)', display: 'block', marginTop: '0.5rem' }}>
                  * Esta contraseña se utilizará para firmar los XML en el backend.
                </small>
              </div>

              {isUploading && (
                <div style={{ width: '100%', background: 'var(--panel-border)', borderRadius: '4px', height: '8px', marginBottom: '1rem', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, background: 'var(--accent)', height: '100%', transition: 'width 0.3s ease' }}></div>
                </div>
              )}

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} disabled={isUploading}>
                {isUploading ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                {isUploading ? 'Subiendo y Guardando...' : 'Guardar Perfil Fiscal'}
              </button>
            </form>
          )}
          </>
          )}

        </div>

        {/* --- PANTALLA SECUNDARIA --- */}
        <div className="glass-panel" style={{ padding: '2rem', marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📺 Pantalla del Cliente (iMin D4-504)
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="csEnabled" 
                  checked={csEnabled}
                  onChange={(e) => handleCsChange('csEnabled', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="csEnabled" style={{ color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>
                  Habilitar Pantalla Secundaria
                </label>
              </div>
            </div>
            
            <button 
              onClick={() => window.open('/pantalla-cliente', '_blank', 'width=800,height=600')}
              style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              ▶️ Abrir Ventana / Forzar Pantalla 2
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', opacity: csEnabled ? 1 : 0.5, pointerEvents: csEnabled ? 'auto' : 'none' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Pantalla de Bienvenida</label>
              <select 
                value={csWelcomeType}
                onChange={(e) => handleCsChange('csWelcomeType', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px', marginBottom: '1.5rem' }}
              >
                <option value="logo_msg">Logo + Mensaje</option>
                <option value="logo_only">Solo Logo</option>
                <option value="msg_only">Solo Mensaje</option>
              </select>

              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Mensaje Personalizado</label>
              <input 
                type="text"
                value={csMessage}
                onChange={(e) => handleCsChange('csMessage', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px' }}
                placeholder="Ej. Bienvenidos a Gravity Denim"
              />
            </div>

            <div>
              <h4 style={{ margin: '0 0 1rem 0', color: '#3b82f6' }}>Opciones de Cobro</h4>
              
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem' }}>
                <input 
                  type="checkbox" 
                  id="csShowTotal" 
                  checked={csShowTotal}
                  onChange={(e) => handleCsChange('csShowTotal', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px' }}
                />
                <label htmlFor="csShowTotal" style={{ color: 'var(--text-main)', cursor: 'pointer' }}>
                  <b>Mostrar Total a Pagar</b>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem' }}>
                <input 
                  type="checkbox" 
                  id="csShowQR" 
                  checked={csShowQR}
                  onChange={(e) => handleCsChange('csShowQR', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px' }}
                />
                <label htmlFor="csShowQR" style={{ color: 'var(--text-main)', cursor: 'pointer' }}>
                  <b>Mostrar Código QR (Pago Transferencia)</b>
                </label>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Durante el proceso de compra, el cliente no verá los productos, precios ni información interna. Esta pantalla solo se activará al momento de dar click en "Cobrar".
              </p>
            </div>
          </div>
        </div>

        {/* --- OPCIONES DE IMPRESIÓN --- */}
        <div className="glass-panel" style={{ padding: '2rem', marginTop: '2rem' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🖨️ Opciones de Impresión de Tickets
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Configura cómo deseas imprimir los comprobantes en este dispositivo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Método de Impresión</label>
              <select 
                value={printMethod}
                onChange={(e) => handlePrintPreferenceChange('method', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px', marginBottom: '1.5rem' }}
              >
                <option value="sistema">Sistema / Navegador (Por defecto)</option>
                <option value="bluetooth">Impresora Bluetooth Externa (Solo Chrome)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Formato del Ticket</label>
              <select 
                value={printFormat}
                onChange={(e) => handlePrintPreferenceChange('format', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px', marginBottom: '1.5rem' }}
              >
                <option value="80mm">80 mm (Estándar)</option>
                <option value="58mm">58 mm (Compacto)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button 
              onClick={() => {
                import('../../utils/printTicket').then(({ printTestTicket }) => {
                  printTestTicket('80mm');
                });
              }}
              style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px', cursor: 'pointer' }}
            >
              Imprimir Prueba 80mm (Sistema)
            </button>

            <button 
              onClick={async () => {
                try {
                  const { imprimirTicketBluetooth58mm } = await import('../../utils/escposPrinter');
                  await imprimirTicketBluetooth58mm(
                    { razonSocial: "Gravity Denim Prueba", ruc: "0000000000001", direccionMatriz: "Local" },
                    { nombre: "Consumidor", numeroIdentificacion: "9999999999" },
                    [{ nombre: "Producto Test", cantidad: 1, precio: 10.00 }],
                    10.00, 0, 10.00,
                    { numeroComprobante: "001-001-000000001", claveAcceso: "1234567890" }
                  );
                } catch (e) {
                  alert("Error en prueba Bluetooth: " + e.message);
                }
              }}
              style={{ padding: '10px 16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: '8px', cursor: 'pointer' }}
            >
              Imprimir Prueba 58mm (Bluetooth)
            </button>
          </div>
        </div>

        {/* --- CÓDIGOS QR DE TRANSFERENCIAS --- */}
        <div className="glass-panel" style={{ padding: '2rem', marginTop: '2rem' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📱 Códigos QR para Transferencias
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Sube los códigos QR que se mostrarán en la pantalla del cliente cuando seleccionen a cada destinatario.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {['Edgar', 'Amparito', 'Junior', 'Diana'].map((person) => (
              <div key={person} style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem' }}>{person}</h4>
                  
                  {transferQrs[person] ? (
                    <button 
                      onClick={() => handleQRRemove(person)}
                      style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Remover QR
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>No configurado</span>
                  )}
                </div>

                {transferQrs[person] ? (
                  <div style={{ textAlign: 'center', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                    <img src={transferQrs[person]} alt={`QR ${person}`} style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1rem', border: '2px dashed var(--panel-border)', borderRadius: '8px' }}>
                    {uploadingQRFor === person ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
                        <Loader2 className="animate-spin" size={20} />
                        <span>Subiendo...</span>
                      </div>
                    ) : (
                      <>
                        <input 
                          type="file" 
                          id={`qr_upload_${person}`} 
                          accept="image/*" 
                          onChange={(e) => handleQRUpload(person, e)}
                          style={{ display: 'none' }}
                        />
                        <label htmlFor={`qr_upload_${person}`} style={{ color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <UploadCloud size={20} />
                          <span>Subir Imagen QR</span>
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* --- PREFERENCIAS DE IMPRESIÓN --- */}
        <div className="glass-panel" style={{ padding: '2rem', marginTop: '2rem' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🖨️ Preferencias de Impresión
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Formato de Papel</label>
              <select 
                value={printFormat} 
                onChange={(e) => handlePrintPreferenceChange('format', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px' }}
              >
                <option value="80mm">80 mm (Estándar)</option>
                <option value="58mm">58 mm (Bluetooth/Portable)</option>
              </select>

              <label style={{ display: 'block', margin: '1.5rem 0 0.5rem 0', color: 'var(--text-muted)' }}>Método de Conexión</label>
              <select 
                value={printMethod} 
                onChange={(e) => handlePrintPreferenceChange('method', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', borderRadius: '8px' }}
              >
                <option value="sistema">Impresión de Sistema (HTML/Dialog)</option>
                <option value="bluetooth">Impresión Bluetooth BLE</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
              <button 
                onClick={() => {
                  import('../../utils/printTicket').then(module => {
                    module.imprimirTicket(
                      { name: 'GRAVITY DENIM PRUEBA', ruc: '0000000000001' }, 
                      [{ name: 'Pantalón Jean Prueba', qty: 1, price: 25.00 }], 
                      { subtotal: 25.00, ivaAmount: 0, total: 25.00 }, 
                      { nombre: 'CLIENTE PRUEBA', numeroIdentificacion: '9999999999' }, 
                      '1234567890', 
                      'EFECTIVO', 
                      null, 
                      false, 
                      '80mm'
                    );
                  });
                }}
                style={{ padding: '12px', background: 'var(--panel-border)', color: 'var(--text-main)', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                🖨️ Imprimir Prueba 80 mm (Sistema)
              </button>

              <button 
                onClick={() => {
                  import('../../utils/printTicket').then(module => {
                    module.imprimirTicket(
                      { name: 'GRAVITY DENIM PRUEBA', ruc: '0000000000001' }, 
                      [{ name: 'Pantalón Jean Prueba', qty: 1, price: 25.00 }], 
                      { subtotal: 25.00, ivaAmount: 0, total: 25.00 }, 
                      { nombre: 'CLIENTE PRUEBA', numeroIdentificacion: '9999999999' }, 
                      '1234567890', 
                      'EFECTIVO', 
                      null, 
                      false, 
                      '58mm'
                    );
                  });
                }}
                className="btn-primary"
                style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                🖨️ Imprimir Prueba 58 mm (Portable)
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
