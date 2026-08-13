import React, { useState } from 'react';
import { AlertTriangle, Copy, ExternalLink, CheckCircle2, X } from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Calcula el plazo legal máximo para solicitar la anulación en línea ante el SRI.
 * Regla SRI (Normativa comprobantes desde 01/08/2025):
 * La solicitud de anulación en línea puede realizarse hasta el día 7 del mes subsiguiente a la emisión.
 * Si el día 7 cae en fin de semana (sábado o domingo), se desplaza al siguiente día hábil (lunes).
 * Nota: Los feriados nacionales no se ajustan dinámicamente al no disponer de una API oficial de feriados.
 */
export function calcularPlazoAnulacionSRI(sale) {
  const rawDate = sale?.fechaTransaccion ?? sale?.fechaEmision ?? sale?.date ?? sale?.fecha ?? sale?.createdAt;
  if (!rawDate) {
    return { fechaEmisionStr: 'S/F', fechaLimiteStr: 'S/F', dentroDePlazo: true };
  }

  let dateObj;
  if (typeof rawDate?.toDate === 'function') {
    dateObj = rawDate.toDate();
  } else if (rawDate?.seconds) {
    dateObj = new Date(rawDate.seconds * 1000);
  } else {
    dateObj = new Date(rawDate);
  }

  if (Number.isNaN(dateObj.getTime())) {
    return { fechaEmisionStr: 'S/F', fechaLimiteStr: 'S/F', dentroDePlazo: true };
  }

  const emisionYear = dateObj.getFullYear();
  const emisionMonth = dateObj.getMonth(); // 0-indexed

  // Día 7 del mes siguiente a la emisión
  let limiteYear = emisionYear;
  let limiteMonth = emisionMonth + 1;
  if (limiteMonth > 11) {
    limiteMonth = 0;
    limiteYear += 1;
  }

  // Crear fecha para el día 7 del mes siguiente a las 23:59:59.999
  let limiteDate = new Date(limiteYear, limiteMonth, 7, 23, 59, 59, 999);

  // Ajuste por fin de semana: Sábado (6) -> Lunes 9; Domingo (0) -> Lunes 8
  const dayOfWeek = limiteDate.getDay();
  if (dayOfWeek === 6) {
    limiteDate.setDate(9);
  } else if (dayOfWeek === 0) {
    limiteDate.setDate(8);
  }

  const now = new Date();
  const dentroDePlazo = now <= limiteDate;

  const fechaEmisionStr = dateObj.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fechaLimiteStr = `${limiteDate.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })} 23:59`;

  return {
    fechaEmisionStr,
    fechaLimiteStr,
    fechaLimiteDate: limiteDate,
    dentroDePlazo
  };
}

export default function ModalSolicitarAnulacionSRI({ venta, onClose, currentUser }) {
  if (!venta) return null;

  const [motivo, setMotivo] = useState('');
  const [notasAdmin, setNotasAdmin] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const claveAcceso = venta.claveAcceso || venta.accessKey || '';
  const numComp = venta.numeroComprobante || venta.secuencial || 'S/N';
  const clienteNombre = (venta.cliente || venta.customer)?.nombre || 'Consumidor Final';
  const total = (venta.totals?.total || venta.total || 0).toFixed(2);
  const estab = venta.establecimiento || venta.estab || '001';
  const ptoEmi = venta.puntoEmision || venta.ptoEmi || '100';
  const emisorRuc = venta.emisorRuc || venta.issuerRuc || 'S/N';

  const estadoActual = (venta.estadoSri || venta.status || '').toUpperCase();
  const isSolicitado = estadoActual === 'SOLICITADA_ANULACION_SRI';

  // 1. Doble protección contra anulación de facturas a Consumidor Final
  const clientObj = venta.cliente || venta.customer || {};
  const clientDoc = (clientObj.numeroIdentificacion || clientObj.cedula || clientObj.ruc || '').toString().trim();
  const clientType = (clientObj.tipoDocumento || '').toString().trim().toUpperCase();
  const clientName = (clientObj.nombre || '').toString().trim().toUpperCase();
  const isConsumidorFinal = clientType === 'CONSUMIDOR_FINAL' || clientDoc === '9999999999999' || clientDoc === '9999999999' || clientName === 'CONSUMIDOR FINAL';

  // 2. Cálculo legal de plazo de anulación ante el SRI
  const { fechaEmisionStr, fechaLimiteStr, dentroDePlazo } = calcularPlazoAnulacionSRI(venta);

  const handleCopyClave = () => {
    if (!claveAcceso) return;
    navigator.clipboard.writeText(claveAcceso);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // Paso 1: Registrar Solicitud y Redirigir a SRI en Línea
  const handleRegistrarSolicitud = async () => {
    if (isConsumidorFinal) {
      setError('Este comprobante fue emitido a CONSUMIDOR FINAL y no puede solicitarse su anulación por este mecanismo.');
      return;
    }

    if (!dentroDePlazo) {
      setError('FUERA DEL PLAZO DE ANULACIÓN EN LÍNEA DEL SRI. No se puede iniciar la solicitud.');
      return;
    }

    if (!motivo.trim()) {
      setError('Por favor, ingrese el motivo de la solicitud de anulación.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const ventaRef = doc(db, 'ventas', venta.id);

      // 1. Actualizar estado de la venta a SOLICITADA_ANULACION_SRI
      await updateDoc(ventaRef, {
        estadoSri: 'SOLICITADA_ANULACION_SRI',
        fechaSolicitudAnulacionSri: now,
        motivoSolicitudAnulacionSri: motivo.trim(),
        solicitadoPorUid: currentUser?.uid || 'admin',
        solicitadoPorNombre: currentUser?.displayName || currentUser?.email || 'Administrador'
      });

      // 2. Registrar en colección de auditoría sri_anulaciones
      await addDoc(collection(db, 'sri_anulaciones'), {
        ventaId: venta.id,
        numeroComprobante: numComp,
        claveAcceso,
        emisorRuc,
        tipoAccion: 'SOLICITUD_ANULACION',
        estadoAnterior: estadoActual,
        estadoNuevo: 'SOLICITADA_ANULACION_SRI',
        motivo: motivo.trim(),
        fechaEmision: fechaEmisionStr,
        fechaLimiteSri: fechaLimiteStr,
        dentroDePlazo,
        usuarioUid: currentUser?.uid || 'admin',
        usuarioNombre: currentUser?.displayName || currentUser?.email || 'Administrador',
        fechaRegistro: now,
        createdAt: serverTimestamp()
      });

      // 3. Abrir portal SRI en Línea en nueva pestaña
      window.open('https://srienlinea.sri.gob.ec', '_blank');

      setLoading(false);
      onClose();
    } catch (err) {
      console.error('Error al registrar solicitud de anulación SRI:', err);
      setError('Error al guardar la solicitud: ' + err.message);
      setLoading(false);
    }
  };

  // Paso 2: Confirmación Manual por el Administrador (cuando ya se aprobó en SRI en Línea)
  const handleConfirmarAnulacion = async () => {
    setLoading(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const ventaRef = doc(db, 'ventas', venta.id);

      // 1. Actualizar estado final a ANULADA_SRI
      await updateDoc(ventaRef, {
        estadoSri: 'ANULADA_SRI',
        fechaConfirmacionAnulacionSri: now,
        notasConfirmacionAnulacionSri: notasAdmin.trim() || 'Confirmado por Administrador en portal SRI en Línea',
        confirmadoPorUid: currentUser?.uid || 'admin',
        confirmadoPorNombre: currentUser?.displayName || currentUser?.email || 'Administrador'
      });

      // 2. Auditoría inmutable de confirmación manual
      await addDoc(collection(db, 'sri_anulaciones'), {
        ventaId: venta.id,
        numeroComprobante: numComp,
        claveAcceso,
        emisorRuc,
        tipoAccion: 'CONFIRMACION_MANUAL_ADMIN',
        estadoAnterior: 'SOLICITADA_ANULACION_SRI',
        estadoNuevo: 'ANULADA_SRI',
        confirmadoPorAdmin: true,
        notasAdmin: notasAdmin.trim() || 'Confirmado por Administrador en portal SRI en Línea',
        usuarioUid: currentUser?.uid || 'admin',
        usuarioNombre: currentUser?.displayName || currentUser?.email || 'Administrador',
        fechaConfirmacion: now,
        createdAt: serverTimestamp()
      });

      setLoading(false);
      onClose();
    } catch (err) {
      console.error('Error al confirmar anulación SRI:', err);
      setError('Error al confirmar la anulación: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '580px',
        color: 'white',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          background: isSolicitado ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle color={isSolicitado ? '#f59e0b' : '#ef4444'} size={24} />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>
              {isSolicitado ? 'Confirmar Anulación en el SRI' : 'Solicitud de Anulación en SRI en Línea'}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#fca5a5',
              fontSize: '0.88rem'
            }}>
              {error}
            </div>
          )}

          {/* Resumen de comprobante */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            fontSize: '0.88rem'
          }}>
            <div><span style={{ color: '#94a3b8' }}>Comprobante:</span> <strong style={{ color: '#38bdf8' }}>{numComp}</strong></div>
            <div><span style={{ color: '#94a3b8' }}>Total:</span> <strong>${total}</strong></div>
            <div><span style={{ color: '#94a3b8' }}>Cliente:</span> {clienteNombre}</div>
            <div><span style={{ color: '#94a3b8' }}>Est-PtoEmi:</span> {estab}-{ptoEmi}</div>
          </div>

          {/* Estado de Plazo Legal SRI */}
          {!isSolicitado && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.9)',
              border: `1px solid ${dentroDePlazo ? 'rgba(52, 211, 153, 0.3)' : 'rgba(239, 68, 68, 0.4)'}`,
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.84rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>🗓️ Plazo Legal de Anulación SRI:</span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  background: dentroDePlazo ? 'rgba(52, 211, 153, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: dentroDePlazo ? '#34d399' : '#f87171'
                }}>
                  {dentroDePlazo ? 'DENTRO DEL PLAZO' : 'FUERA DEL PLAZO'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: '#e2e8f0', fontSize: '0.8rem' }}>
                <div>Emisión: <strong>{fechaEmisionStr}</strong></div>
                <div>Límite SRI: <strong>{fechaLimiteStr}</strong></div>
              </div>
            </div>
          )}

          {/* Clave de Acceso y Botón de Copiado */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '6px' }}>
              🔑 Clave de Acceso SRI (49 Dígitos)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={claveAcceso}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#38bdf8',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem'
                }}
              />
              <button
                type="button"
                onClick={handleCopyClave}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: copiado ? '#10b981' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                {copiado ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Bloqueo si es Consumidor Final */}
          {isConsumidorFinal && !isSolicitado && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.84rem',
              color: '#fca5a5',
              fontWeight: 'bold'
            }}>
              🚫 Este comprobante fue emitido a CONSUMIDOR FINAL y no puede solicitarse su anulación por este mecanismo.
            </div>
          )}

          {/* Bloqueo si está Fuera del Plazo */}
          {!dentroDePlazo && !isSolicitado && !isConsumidorFinal && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.84rem',
              color: '#fca5a5',
              fontWeight: 'bold'
            }}>
              ⚠️ FUERA DEL PLAZO DE ANULACIÓN EN LÍNEA DEL SRI.
            </div>
          )}

          {!isSolicitado ? (
            /* Formulario Paso 1: Solicitar */
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '6px' }}>
                  Motivo de la Solicitud
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={isConsumidorFinal || !dentroDePlazo}
                  placeholder="Ej: Factura de $0,00 emitida por error / Anulación por duplicado..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'white',
                    fontSize: '0.88rem',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>

              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.82rem',
                color: '#fcd34d'
              }}>
                ℹ️ <strong>Instrucciones SRI:</strong> Al presionar el botón, el estado en el POS cambiará a <code>SOLICITADA_ANULACION_SRI</code> y se abrirá el portal <strong>SRI en Línea</strong> para ingresar la clave de acceso de 49 dígitos. La factura conservará sus datos originales y no cambiará a anulada hasta que la confirmes manualmente tras la aprobación del SRI.
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRegistrarSolicitud}
                  disabled={loading || isConsumidorFinal || !dentroDePlazo}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: (isConsumidorFinal || !dentroDePlazo) ? '#475569' : '#f59e0b',
                    color: (isConsumidorFinal || !dentroDePlazo) ? '#94a3b8' : '#0f172a',
                    border: 'none',
                    cursor: (isConsumidorFinal || !dentroDePlazo) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <ExternalLink size={18} />
                  {loading ? 'Guardando...' : 'Registrar Solicitud y Abrir SRI en Línea'}
                </button>
              </div>
            </>
          ) : (
            /* Formulario Paso 2: Confirmar Anulación por Admin */
            <>
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.82rem',
                color: '#fca5a5'
              }}>
                ⚠️ <strong>Confirmación Administrativa Manual:</strong> Presione este botón <strong>únicamente si ya verificó en SRI en Línea</strong> que la solicitud de anulación fue procesada/aprobada. Esta acción cambiará la factura a <code>ANULADA_SRI</code> y la excluirá de los totales contables.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '6px' }}>
                  Notas de Confirmación / Referencia Trámite SRI (Opcional)
                </label>
                <input
                  type="text"
                  value={notasAdmin}
                  onChange={(e) => setNotasAdmin(e.target.value)}
                  placeholder="Ej: Aprobado en SRI en Línea el 13/08/2026..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'white',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarAnulacion}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle2 size={18} />
                  {loading ? 'Confirmando...' : 'Confirmar Anulación SRI (Admin)'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
