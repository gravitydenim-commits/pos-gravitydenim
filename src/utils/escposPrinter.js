// ============================================================================
// IMPRESORA CRONE CRM-03 — Bluetooth Clásico (SPP) vía RawBT
// ============================================================================
//
// ⚠️  ADVERTENCIA PARA FUTUROS DESARROLLADORES:
//
//     La impresora CRONE CRM-03 (58mm) utiliza Bluetooth Clásico (SPP),
//     NO Bluetooth Low Energy (BLE/GATT).
//
//     Web Bluetooth API (navigator.bluetooth) solo soporta BLE y NO es
//     compatible con la CRM-03. Cualquier intento de usar Web Bluetooth
//     GATT con esta impresora FALLARÁ silenciosamente.
//
//     La conexión funciona a través de la app RawBT (Play Store), que
//     expone un WebSocket local en ws://127.0.0.1:40213/ y actúa como
//     puente entre el navegador y el Bluetooth Clásico SPP.
//
//     NO reemplazar esta implementación por Web Bluetooth/GATT/BLE.
//     Si se necesita soporte BLE para otra impresora en el futuro,
//     crear un archivo SEPARADO (ej. escposPrinterBLE.js).
//
// ============================================================================

// Comandos ESC/POS básicos
const ESC = 0x1B;
const GS = 0x1D;

/**
 * Imprime un ticket de 58mm en la CRONE CRM-03 vía Bluetooth Clásico (SPP).
 * Requiere la app RawBT corriendo en el dispositivo Android.
 * 
 * Flujo: Navegador → WebSocket (localhost:40213) → RawBT → Bluetooth SPP → CRM-03
 */
export async function imprimirTicketBluetooth58mm(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
  try {
    console.log("Iniciando conexión a RawBT (Classic Bluetooth SPP)...");
    
    // 1. Construir comandos ESC/POS
    let data = [];
    const encoder = new TextEncoder();
    
    const send = (bytes) => {
      if (Array.isArray(bytes)) {
        bytes.forEach(b => data.push(b));
      } else {
        data.push(bytes);
      }
    };

    const sendText = (str) => {
       // Remover tildes para evitar problemas de codificación en impresoras genéricas
       const safeStr = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
       const encoded = encoder.encode(safeStr);
       encoded.forEach(b => data.push(b));
    };

    // Inicializar impresora
    send([ESC, 0x40]); // ESC @ — Init

    // Alineación centro
    send([ESC, 0x61, 0x01]); 
    
    // Nombre Empresa (Grande)
    send([ESC, 0x21, 0x30]); // Doble alto y ancho
    sendText(`${issuerData.razonSocial || issuerData.name || 'Mi Empresa'}\n`);
    send([ESC, 0x21, 0x00]); // Normal
    
    if (issuerData.nombreComercial && issuerData.nombreComercial !== issuerData.razonSocial) {
      sendText(`${issuerData.nombreComercial}\n`);
    }

    sendText(`RUC: ${issuerData.ruc}\n`);
    if (issuerData.direccionMatriz || issuerData.address) {
      sendText(`Dir: ${issuerData.direccionMatriz || issuerData.address}\n`);
    }
    sendText(`--------------------------------\n`); // 32 chars max for 58mm

    // Alineación Izquierda
    send([ESC, 0x61, 0x00]);

    if (comprobante && comprobante.isNotaVenta) {
      send([ESC, 0x21, 0x10]); // Doble alto
      sendText(`NOTA DE VENTA\n`);
      send([ESC, 0x21, 0x00]); // Normal
      sendText(`Ref Interna: ${comprobante.claveAcceso || 'S/N'}\n`);
    } else if (comprobante) {
      sendText(`FACTURA: ${comprobante.numeroComprobante || 'S/N'}\n`);
      sendText(`Clave Acceso: ${comprobante.claveAcceso || 'S/N'}\n`);
    }

    sendText(`Fecha: ${new Date().toLocaleString('es-EC')}\n`);
    sendText(`--------------------------------\n`);
    sendText(`Cliente: ${clientData.nombre || 'Consumidor Final'}\n`);
    sendText(`RUC/CI: ${clientData.numeroIdentificacion || '9999999999999'}\n`);
    sendText(`--------------------------------\n`);
    sendText(`CANT DESCRIPCION           TOTAL\n`); 
    sendText(`--------------------------------\n`);

    // Ítems
    cartItems.forEach(item => {
      const qtyStr = String(item.cantidad || item.qty).padEnd(4, ' ');
      // Truncar descripcion a 15 chars
      const descStr = (item.nombre || item.name || '').substring(0, 15).padEnd(16, ' ');
      const totalStr = `$${((item.precio || item.price) * (item.cantidad || item.qty)).toFixed(2)}`.padStart(12, ' ');
      
      sendText(`${qtyStr}${descStr}${totalStr}\n`);
    });

    sendText(`--------------------------------\n`);

    // Alineación Derecha para totales
    send([ESC, 0x61, 0x02]);
    sendText(`SUBTOTAL: $${subtotal.toFixed(2)}\n`);
    sendText(`IVA: $${ivaTotal.toFixed(2)}\n`);
    
    // Total Grande
    send([ESC, 0x21, 0x10]); // Doble alto
    sendText(`TOTAL: $${grandTotal.toFixed(2)}\n`);
    send([ESC, 0x21, 0x00]); // Normal

    // Alineación Centro para final
    send([ESC, 0x61, 0x01]);
    sendText(`--------------------------------\n`);
    sendText(`!Gracias por su compra!\n`);
    sendText(`\n\n\n\n`); // Avanzar papel
    
    // Cortar papel
    send([GS, 0x56, 0x41, 0x00]); 

    // Convertir a ArrayBuffer (requerido por el WebSocket de RawBT)
    const payload = new Uint8Array(data).buffer;

    // 2. Enviar comandos a RawBT vía WebSocket (Bluetooth Clásico SPP)
    //    RawBT expone un WebSocket local en el puerto 40213
    //    Flujo: WebSocket → RawBT → Bluetooth SPP → CRM-03
    return new Promise((resolve, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:40213/');
      
      const timeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
          reject(new Error("No se pudo conectar a RawBT. Asegúrate de tener la app abierta en la tablet."));
        }
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timeout);
        console.log("WebSocket a RawBT abierto. Enviando comandos ESC/POS...");
        socket.send(payload);
        setTimeout(() => {
          socket.close();
          resolve(true);
        }, 500); // Darle tiempo para enviar antes de cerrar
      };

      socket.onerror = (err) => {
        clearTimeout(timeout);
        console.error("Error WebSocket RawBT:", err);
        reject(new Error(
          "No se detecta la app RawBT en esta tablet.\n" +
          "Para imprimir en la CRONE CRM-03:\n" +
          "1. Instala RawBT desde la Play Store\n" +
          "2. Empareja la CRM-03 en Ajustes de Bluetooth de Android\n" +
          "3. Abre RawBT y selecciona la CRM-03\n" +
          "4. Vuelve a intentar la impresión"
        ));
      };
    });

  } catch (error) {
    console.error("Error en impresión Bluetooth (RawBT/SPP):", error);
    throw error;
  }
}
