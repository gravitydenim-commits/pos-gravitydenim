// Bluetooth ESC/POS Printer Utility para 58mm (Web Bluetooth Directo y RawBT)
const ESC = 0x1B;
const GS = 0x1D;

// UUIDs de servicios BLE conocidos para impresoras térmicas ESC/POS
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic BLE printer service
  '0000ff00-0000-1000-8000-00805f9b34fb', // Common Chinese BLE printer (FF00)
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / Generic
  '0000e781-0000-1000-8000-00805f9b34fb', // Custom printer UUID
  '00004953-5343-fe7d-4158-6465636c6b6d', // ISSC Transparent
  '49535343-fe7d-4158-6465-636c6b6d6567', // Microchip BLE UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Common thermal printer
];

// UUIDs de características de escritura conocidas
const WRITE_CHAR_UUIDS = [
  '0000ff02-0000-1000-8000-00805f9b34fb', // FF02 write
  '00002af1-0000-1000-8000-00805f9b34fb', // 2AF1 write
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // ISSC Transparent TX
  '49535343-1e4d-4bd9-ba61-23c647249616', // ISSC Transparent RX
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // Common thermal write
];

async function discoverAllServices(server) {
  // Intentar descubrir TODOS los servicios disponibles en el dispositivo
  console.log('[BT] Descubriendo todos los servicios GATT disponibles...');
  
  let allServices = [];
  
  // 1. Intentar con los UUIDs conocidos
  for (const uuid of PRINTER_SERVICES) {
    try {
      const svc = await server.getPrimaryService(uuid);
      console.log(`[BT] ✅ Servicio encontrado: ${uuid}`);
      allServices.push(svc);
    } catch (e) {
      // No existe, continuar
    }
  }

  // 2. Si no encontramos ninguno conocido, intentar Serial Port Profile genérico
  if (allServices.length === 0) {
    const genericUUIDs = [
      '00001101-0000-1000-8000-00805f9b34fb', // SPP UUID
      '0000ffe0-0000-1000-8000-00805f9b34fb', // Common HM-10 / HM-05
      '0000fff0-0000-1000-8000-00805f9b34fb', // Common alt
    ];
    for (const uuid of genericUUIDs) {
      try {
        const svc = await server.getPrimaryService(uuid);
        console.log(`[BT] ✅ Servicio genérico encontrado: ${uuid}`);
        allServices.push(svc);
      } catch (e) {
        // No existe
      }
    }
  }

  return allServices;
}

async function findWriteCharacteristic(server) {
  const services = await discoverAllServices(server);

  if (services.length === 0) {
    throw new Error(
      "No se detectó ningún servicio GATT compatible en la impresora.\n" +
      "Servicios buscados: " + PRINTER_SERVICES.length + " UUIDs estándar.\n" +
      "Verifica que la impresora esté encendida y en modo Bluetooth."
    );
  }

  // Buscar una característica de escritura en CUALQUIER servicio encontrado
  for (const service of services) {
    try {
      const characteristics = await service.getCharacteristics();
      console.log(`[BT] Servicio ${service.uuid} tiene ${characteristics.length} característica(s):`);
      
      for (const c of characteristics) {
        const props = [];
        if (c.properties.write) props.push('write');
        if (c.properties.writeWithoutResponse) props.push('writeWithoutResponse');
        if (c.properties.read) props.push('read');
        if (c.properties.notify) props.push('notify');
        console.log(`  [BT] Char ${c.uuid}: [${props.join(', ')}]`);
      }

      // Preferir writeWithoutResponse (más rápido para impresoras)
      let writeChar = characteristics.find(c => c.properties.writeWithoutResponse);
      if (!writeChar) {
        writeChar = characteristics.find(c => c.properties.write);
      }
      
      if (writeChar) {
        console.log(`[BT] ✅ Usando característica de escritura: ${writeChar.uuid} (${writeChar.properties.writeWithoutResponse ? 'writeWithoutResponse' : 'write'})`);
        return writeChar;
      }
    } catch (e) {
      console.warn(`[BT] Error al leer características del servicio ${service.uuid}:`, e.message);
    }
  }

  throw new Error(
    "La impresora expone servicios GATT pero ninguno tiene una característica de escritura.\n" +
    "Servicios encontrados: " + services.map(s => s.uuid).join(', ') + "\n" +
    "Esto puede indicar que la impresora requiere Bluetooth Clásico (SPP) en vez de BLE."
  );
}

async function writeWithRetry(writeChar, chunk, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (writeChar.properties.writeWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk);
      } else {
        await writeChar.writeValueWithResponse(chunk);
      }
      return;
    } catch (e) {
      if (attempt === retries) throw e;
      console.warn(`[BT] Escritura fallo intento ${attempt}/${retries}, reintentando...`);
      await new Promise(r => setTimeout(r, 50 * attempt));
    }
  }
}

async function sendPayload(writeChar, payload) {
  // Escribir en chunks de 20 bytes (límite MTU estándar BLE)
  const chunkSize = 20;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    await writeWithRetry(writeChar, chunk);
    // Pequeña pausa entre chunks para evitar overflow del buffer de la impresora
    if (i + chunkSize < payload.length) {
      await new Promise(r => setTimeout(r, 10));
    }
  }
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
    throw new Error(
      "Web Bluetooth API no está soportada en este navegador.\n" +
      "Utiliza Google Chrome o Microsoft Edge con HTTPS habilitado."
    );
  }

  console.log('[BT] Solicitando dispositivo Bluetooth...');

  let device;
  try {
    device = await navigator.bluetooth.requestDevice({
      // Aceptar todos los dispositivos para mostrar impresoras genéricas
      acceptAllDevices: true,
      // Declarar todos los servicios que podríamos usar
      optionalServices: [
        ...PRINTER_SERVICES,
        '00001101-0000-1000-8000-00805f9b34fb', // SPP
        '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10
        '0000fff0-0000-1000-8000-00805f9b34fb', // Alt
      ]
    });
  } catch (err) {
    if (err.name === 'NotFoundError' || err.message.includes('cancelled') || err.message.includes('canceled')) {
      throw new Error("Selección cancelada. No se eligió ningún dispositivo.");
    }
    throw new Error(`Error al buscar dispositivos: ${err.message}`);
  }

  console.log(`[BT] Dispositivo seleccionado: "${device.name || '(sin nombre)'}"`);
  console.log(`[BT] ID: ${device.id}`);

  // Paso 2: Conectar al servidor GATT
  let server;
  try {
    console.log('[BT] Conectando al servidor GATT...');
    server = await device.gatt.connect();
    console.log('[BT] ✅ Servidor GATT conectado');
  } catch (err) {
    throw new Error(
      `Error al conectar GATT con "${device.name}":\n` +
      `${err.message}\n\n` +
      `Posibles causas:\n` +
      `- La impresora está apagada o fuera de alcance\n` +
      `- Otro dispositivo ya tiene una conexión activa\n` +
      `- La impresora usa Bluetooth Clásico (SPP) y no BLE`
    );
  }

  // Paso 3: Buscar un servicio/característica de escritura
  let writeChar;
  try {
    writeChar = await findWriteCharacteristic(server);
  } catch (err) {
    server.disconnect();
    throw new Error(
      `Conectado a "${device.name}" pero no se encontró servicio de impresión:\n` +
      `${err.message}\n\n` +
      `Si la CRM-03 no aparece compatible, prueba el método "Bluetooth Clásico (RawBT)".`
    );
  }

  // Paso 4: Enviar un byte de prueba para confirmar que la escritura funciona
  try {
    const initCmd = new Uint8Array([ESC, 0x40]); // ESC @ (Initialize printer)
    await writeWithRetry(writeChar, initCmd);
    console.log('[BT] ✅ Comando de inicialización enviado con éxito');
  } catch (err) {
    server.disconnect();
    throw new Error(
      `Conectado a "${device.name}" y servicio encontrado, pero la escritura falló:\n` +
      `${err.message}\n\n` +
      `Puede ser un problema de permisos GATT o la impresora rechazó el comando.`
    );
  }

  // Guardar info del dispositivo
  const printerName = device.name || 'CRM-03';
  localStorage.setItem('bluetooth_printer_name', printerName);
  localStorage.setItem('bluetooth_printer_id', device.id);
  
  // Guardar UUID de servicio y característica que funcionaron para reconexión rápida
  localStorage.setItem('bluetooth_printer_service', writeChar.service.uuid);
  localStorage.setItem('bluetooth_printer_char', writeChar.uuid);

  server.disconnect();
  console.log(`[BT] ✅ Impresora "${printerName}" vinculada y verificada con éxito`);
  return printerName;
}

export async function probarConexionDirecta() {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth API no soportada en este navegador.");
  }

  // Intentar obtener la impresora previamente vinculada
  const savedName = localStorage.getItem('bluetooth_printer_name');
  let device;

  try {
    const devices = await navigator.bluetooth.getDevices();
    console.log(`[BT] Dispositivos previamente vinculados: ${devices.length}`);
    devices.forEach(d => console.log(`  - "${d.name}" (${d.id})`));

    device = devices.find(d => d.name === savedName);
    
    if (device) {
      // Solicitar vigilancia de advertisements para poder reconectar
      try {
        const abortController = new AbortController();
        await device.watchAdvertisements({ signal: abortController.signal });
        // Esperar un poco para que aparezca el advertisement
        await new Promise(r => setTimeout(r, 2000));
        abortController.abort();
      } catch (e) {
        console.log('[BT] watchAdvertisements no soportado o falló, intentando conexión directa...');
      }
    }
  } catch (e) {
    console.log('[BT] getDevices() no disponible:', e.message);
  }

  if (!device) {
    throw new Error(
      `No se encontró la impresora "${savedName || '(ninguna)'}". ` +
      `Haz clic en "Buscar y Vincular Impresora" para emparejarla nuevamente.`
    );
  }

  console.log(`[BT] Reconectando a "${device.name}"...`);
  let server;
  try {
    server = await device.gatt.connect();
  } catch (err) {
    throw new Error(
      `No se pudo reconectar a "${device.name}":\n${err.message}\n\n` +
      `Intenta vincular la impresora nuevamente con el botón "Buscar y Vincular".`
    );
  }

  try {
    const writeChar = await findWriteCharacteristic(server);
    
    // Enviar comandos ESC/POS de prueba
    const encoder = new TextEncoder();
    let testData = [];
    testData.push(ESC, 0x40); // Init
    testData.push(ESC, 0x61, 0x01); // Centro
    
    const textBytes = encoder.encode("\n--- CONEXION CRM-03 OK ---\nImpresora 58mm ESC/POS\nGravity Denim POS\n\n\n\n");
    textBytes.forEach(b => testData.push(b));
    testData.push(GS, 0x56, 0x41, 0x00); // Cortar
    
    const payload = new Uint8Array(testData);
    await sendPayload(writeChar, payload);
    
    console.log('[BT] ✅ Prueba de impresión enviada con éxito');
    return true;
  } catch (err) {
    throw new Error(
      `Conectado a "${device.name}" pero falló el envío de datos:\n${err.message}`
    );
  } finally {
    server.disconnect();
  }
}

export async function imprimirTicketBluetoothDirecto(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth API no soportada.");
  }

  const savedName = localStorage.getItem('bluetooth_printer_name');
  let device;

  try {
    const devices = await navigator.bluetooth.getDevices();
    device = devices.find(d => d.name === savedName);
    
    if (device) {
      try {
        const abortController = new AbortController();
        await device.watchAdvertisements({ signal: abortController.signal });
        await new Promise(r => setTimeout(r, 1500));
        abortController.abort();
      } catch (e) {
        // watchAdvertisements puede no estar soportado, intentar conexión directa
      }
    }
  } catch (e) {
    console.log('[BT] getDevices() falló:', e.message);
  }
  
  if (!device) {
    throw new Error(`No hay impresoras Bluetooth vinculadas. Vincula la CRM-03 en Ajustes.`);
  }

  console.log(`[BT] Conectando a "${device.name}" para imprimir...`);
  const payload = buildEscposPayload(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante);

  let server;
  try {
    server = await device.gatt.connect();
  } catch (err) {
    throw new Error(
      `No se pudo conectar a "${device.name}" para imprimir:\n${err.message}\n\n` +
      `Verifica que la impresora esté encendida y cerca.`
    );
  }

  try {
    const writeChar = await findWriteCharacteristic(server);
    await sendPayload(writeChar, payload);
    console.log('[BT] ✅ Ticket enviado con éxito');
    return true;
  } catch (err) {
    throw new Error(`Fallo al enviar datos a "${device.name}":\n${err.message}`);
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
