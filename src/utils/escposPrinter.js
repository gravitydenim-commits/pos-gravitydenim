// Bluetooth ESC/POS Printer Utility para 58mm
// Usa la Web Bluetooth API (Solo funciona en Chrome/Edge en Android, Windows, Mac)

// Comandos ESC/POS básicos
const ESC = 0x1B;
const GS = 0x1D;

export async function imprimirTicketBluetooth58mm(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
  try {
    console.log("Iniciando conexión Bluetooth...");
    
    // 1. Solicitar dispositivo Bluetooth
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '0000180a-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000fee7-0000-1000-8000-00805f9b34fb'] 
    }).catch(err => {
      // Si falla con filtros, probar modo libre (algunas genéricas no anuncian el servicio 18f0 bien)
      console.warn("Fallo con filtros, intentando sin filtros de servicio...", err);
      return navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000fee7-0000-1000-8000-00805f9b34fb']
      });
    });

    console.log("Dispositivo seleccionado:", device.name);

    // 2. Conectar al GATT Server
    const server = await device.gatt.connect();
    
    // 3. Obtener el servicio primario (intentar genéricos)
    let service;
    const services = await server.getPrimaryServices();
    if (services.length === 0) {
      throw new Error("La impresora no expone servicios GATT.");
    }
    
    // Buscar un servicio conocido de impresión
    const knownServices = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000fee7-0000-1000-8000-00805f9b34fb'];
    service = services.find(s => knownServices.includes(s.uuid)) || services[0];

    console.log("Servicio usado:", service.uuid);

    // 4. Obtener la característica de escritura
    let characteristic;
    const characteristics = await service.getCharacteristics();
    for (const char of characteristics) {
      if (char.properties.write || char.properties.writeWithoutResponse) {
        characteristic = char;
        break;
      }
    }

    if (!characteristic) {
      throw new Error("No se encontró una característica de escritura en la impresora Bluetooth.");
    }

    // 5. Construir comandos ESC/POS
    let data = [];
    const encoder = new TextEncoder();
    
    const send = (bytes) => {
      bytes.forEach(b => data.push(b));
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
    sendText(`${issuerData.razonSocial || 'Mi Empresa'}\n`);
    send([ESC, 0x21, 0x00]); // Normal
    
    if (issuerData.nombreComercial && issuerData.nombreComercial !== issuerData.razonSocial) {
      sendText(`${issuerData.nombreComercial}\n`);
    }

    sendText(`RUC: ${issuerData.ruc}\n`);
    sendText(`Dir: ${issuerData.direccionMatriz || 'S/N'}\n`);
    sendText(`--------------------------------\n`); // 32 chars max for 58mm

    // Alineación Izquierda
    send([ESC, 0x61, 0x00]);

    if (comprobante && comprobante.isNotaVenta) {
      send([ESC, 0x21, 0x10]); // Doble alto
      sendText(`NOTA DE VENTA\n`);
      send([ESC, 0x21, 0x00]); // Normal
      sendText(`Ref Interna: ${comprobante.claveAcceso || 'S/N'}\n`);
      sendText(`\n DOCUMENTO SIN VALIDEZ TRIBUTARIA\n\n`);
    } else if (comprobante) {
      sendText(`FACTURA: ${comprobante.numeroComprobante || 'S/N'}\n`);
      sendText(`Clave Acceso: ${comprobante.claveAcceso || 'S/N'}\n`);
    }

    sendText(`Fecha: ${new Date().toLocaleString()}\n`);
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

    // 6. Dividir en chunks de 100 bytes y enviar
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = new Uint8Array(data.slice(i, i + CHUNK_SIZE));
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk);
      } else {
        await characteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 50)); 
    }

    console.log("Impresión finalizada con éxito.");
    return true;

  } catch (error) {
    console.error("Error en impresión Bluetooth:", error);
    throw error;
  }
}
