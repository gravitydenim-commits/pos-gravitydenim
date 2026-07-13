// Bluetooth ESC/POS Printer Utility para 58mm (Web Bluetooth Directo y RawBT)
const ESC = 0x1B;
const GS = 0x1D;

const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic BLE printer service
  '0000e781-0000-1000-8000-00805f9b34fb', // Custom printer UUID
  '00004953-5343-fe7d-4158-6465636c6b6d', // ISSC
  '49535343-fe7d-4158-6465-636c6b6d6567'  // Microchip
];

async function findWriteCharacteristic(server) {
  let service;
  for (const uuid of PRINTER_SERVICES) {
    try {
      service = await server.getPrimaryService(uuid);
      if (service) break;
    } catch (e) {
      console.log(`GATT Service ${uuid} not found, trying next...`);
    }
  }

  if (!service) {
    throw new Error("No se detectó un GATT Service compatible en la impresora (UUIDs de impresora estándar no encontrados).");
  }

  const characteristics = await service.getCharacteristics();
  const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
  if (!writeChar) {
    throw new Error("El servicio de impresión no expone una característica de escritura válida (Write Characteristic).");
  }

  return writeChar;
}

export function buildEscposPayload(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
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

  return new Uint8Array(data);
}

export async function conectarImpresoraBluetoothDirecta() {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth API no está soportada en este navegador. Utiliza Google Chrome, Microsoft Edge o una PWA instalada bajo HTTPS.");
  }

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES
    });

    console.log(`Dispositivo seleccionado: ${device.name}`);
    const server = await device.gatt.connect();
    
    // Verificar que expone característica compatible
    await findWriteCharacteristic(server);
    
    // Guardar en localStorage para auto-conectar
    localStorage.setItem('bluetooth_printer_name', device.name || 'CRM-03');
    
    server.disconnect();
    return device.name || 'CRM-03';
  } catch (err) {
    console.error("Error al conectar por Web Bluetooth:", err);
    throw new Error(err.message || "Usuario canceló el emparejamiento o el dispositivo no respondió.");
  }
}

export async function probarConexionDirecta() {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth API no soportada en este navegador.");
  }

  const devices = await navigator.bluetooth.getDevices();
  const savedName = localStorage.getItem('bluetooth_printer_name');
  const device = devices.find(d => d.name === savedName) || devices[0];
  
  if (!device) {
    throw new Error("No hay impresoras vinculadas. Por favor, haz clic en 'Buscar y Vincular Impresora'.");
  }

  const server = await device.gatt.connect();
  try {
    const writeChar = await findWriteCharacteristic(server);
    
    // Enviar comandos ESC/POS de prueba
    const encoder = new TextEncoder();
    
    let testData = [];
    testData.push(ESC, 0x40); // Init
    testData.push(ESC, 0x61, 0x01); // Centro
    
    // Text encoder
    const textBytes = encoder.encode("\n--- CONEXION CRM-03 OK ---\nImpresora 58mm ESC/POS\n\n\n\n");
    textBytes.forEach(b => testData.push(b));
    testData.push(GS, 0x56, 0x41, 0x00); // Cortar
    
    const payload = new Uint8Array(testData);
    
    // Escribir en chunks de 20 bytes
    const chunkSize = 20;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      await writeChar.writeValue(chunk);
    }
    return true;
  } catch (err) {
    console.error("Error en prueba Bluetooth:", err);
    throw new Error(err.message || "Error al comunicarse con la característica GATT.");
  } finally {
    server.disconnect();
  }
}

export async function imprimirTicketBluetoothDirecto(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth API no soportada.");
  }

  const devices = await navigator.bluetooth.getDevices();
  const savedName = localStorage.getItem('bluetooth_printer_name');
  const device = devices.find(d => d.name === savedName) || devices[0];
  
  if (!device) {
    throw new Error("No hay impresoras Bluetooth vinculadas. Vincula la CRM-03 en Ajustes.");
  }

  const payload = buildEscposPayload(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante);

  const server = await device.gatt.connect();
  try {
    const writeChar = await findWriteCharacteristic(server);

    const chunkSize = 20;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      await writeChar.writeValue(chunk);
    }
    return true;
  } catch (err) {
    console.error("Error en impresión Bluetooth directa:", err);
    throw new Error("Fallo al enviar datos: " + (err.message || "Error GATT indefinido"));
  } finally {
    server.disconnect();
  }
}

// Conservamos la función original de RawBT por compatibilidad de fallback
export async function imprimirTicketBluetooth58mm(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
  try {
    const payload = buildEscposPayload(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante).buffer;
    return new Promise((resolve, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:40213/');
      const timeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
          reject(new Error("No se pudo conectar a RawBT. Asegúrate de tener la app abierta."));
        }
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timeout);
        socket.send(payload);
        setTimeout(() => {
          socket.close();
          resolve(true);
        }, 500);
      };

      socket.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error("No se detecta la app RawBT en esta tablet. Por favor, instálala para imprimir por Bluetooth Clásico."));
      };
    });
  } catch (error) {
    console.error("Error en RawBT:", error);
    throw error;
  }
}
