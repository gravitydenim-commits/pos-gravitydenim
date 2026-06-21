import React, { useState, useEffect } from 'react';
import { Save, UploadCloud, FileKey, ShieldCheck, Loader2 } from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

export default function ConfiguracionGeneral() {
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

  // --- SIMULACIÓN DE UPLOAD A FIREBASE STORAGE ---
  const simulateFirebaseStorageUpload = async (file) => {
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          resolve(`https://firebasestorage.googleapis.com/v0/b/gravity-denim.appspot.com/o/firmas%2F${file.name}?alt=media`);
        }
      }, 400);
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

      // 1. Subir archivo .p12 a Firebase Storage (si se seleccionó uno nuevo)
      if (formData.file) {
        console.log(`📤 [Firebase Storage] Subiendo firma ${formData.fileName}...`);
        p12DownloadUrl = await simulateFirebaseStorageUpload(formData.file);
        console.log(`✅ [Firebase Storage] URL generada: ${p12DownloadUrl}`);
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
                  style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent)', color: 'white', borderRadius: '8px', fontSize: '1rem' }}
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
                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', fontSize: '1rem' }}
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
                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', fontSize: '1rem' }}
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
                  style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', fontSize: '1rem' }}
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
                  style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', fontSize: '1rem' }}
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
                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', fontSize: '1rem' }}
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
                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', fontSize: '1rem' }}
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
                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white', fontSize: '1rem' }}
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
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'white' }}
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
      </div>
    </div>
  );
}
