// Bluetooth ESC/POS Printer Utility para 58mm usando puente RawBT (Classic Bluetooth SPP)
// En lugar de usar navigator.bluetooth (que solo soporta BLE), usamos el estándar
// de la industria para web POS: conectarnos al WebSocket de la app RawBT.

// Comandos ESC/POS básicos
const ESC = 0x1B;
const GS = 0x1D;

export async function imprimirTicketBluetooth58mm(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
  try {
    console.log("Iniciando conexión a RawBT (Classic Bluetooth)...");
    
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

    // Inicializar
    send([ESC, 0x40]); // Init

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

    // Convertir a ArrayBuffer
    const payload = new Uint8Array(data).buffer;

    // 2. Enviar comandos a RawBT vía WebSocket
    return new Promise((resolve, reject) => {
      // RawBT expone un WebSocket local en el puerto 40213
      const socket = new WebSocket('ws://127.0.0.1:40213/');
      
      const timeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
          reject(new Error("No se pudo conectar a RawBT. Asegúrate de tener la app abierta."));
        }
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timeout);
        console.log("WebSocket a RawBT abierto. Enviando comandos...");
        socket.send(payload);
        setTimeout(() => {
          socket.close();
          resolve(true);
        }, 500); // Darle tiempo para enviar antes de cerrar
      };

      socket.onerror = (err) => {
        clearTimeout(timeout);
        console.error("Error WebSocket RawBT:", err);
        reject(new Error("No se detecta la app RawBT en esta tablet. Por favor, instálala desde la Play Store para imprimir por Bluetooth Clásico."));
      };
    });

  } catch (error) {
    console.error("Error en impresión Bluetooth (RawBT):", error);
    throw error;
  }
}
