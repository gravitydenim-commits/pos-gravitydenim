const ESC = 0x1B;
const GS = 0x1D;

const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb'
];

async function findWriteCharacteristic(server) {
  let service;
  for (const uuid of PRINTER_SERVICES) {
    try {
      service = await server.getPrimaryService(uuid);
      if (service) break;
    } catch (e) {}
  }

  if (!service) {
    const services = await server.getPrimaryServices();
    if (services.length > 0) service = services[0];
  }

  if (!service) throw new Error("No primary service found");

  const characteristics = await service.getCharacteristics();
  const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
  if (!writeChar) throw new Error("No write characteristic found");

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
     const safeStr = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
     const encoded = encoder.encode(safeStr);
     encoded.forEach(b => data.push(b));
  };

  send([ESC, 0x40]);
  send([ESC, 0x61, 0x01]); 
  send([ESC, 0x21, 0x30]);
  sendText(`${issuerData.razonSocial || issuerData.name || 'Mi Empresa'}\n`);
  send([ESC, 0x21, 0x00]);
  
  if (issuerData.nombreComercial && issuerData.nombreComercial !== issuerData.razonSocial) {
    sendText(`${issuerData.nombreComercial}\n`);
  }

  sendText(`RUC: ${issuerData.ruc}\n`);
  if (issuerData.direccionMatriz || issuerData.address) {
    sendText(`Dir: ${issuerData.direccionMatriz || issuerData.address}\n`);
  }
  sendText(`--------------------------------\n`);

  send([ESC, 0x61, 0x00]);

  if (comprobante && comprobante.isNotaVenta) {
    send([ESC, 0x21, 0x10]);
    sendText(`NOTA DE VENTA\n`);
    send([ESC, 0x21, 0x00]);
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

  cartItems.forEach(item => {
    const qtyStr = String(item.cantidad || item.qty).padEnd(4, ' ');
    const descStr = (item.nombre || item.name || '').substring(0, 15).padEnd(16, ' ');
    const totalStr = `$${((item.precio || item.price) * (item.cantidad || item.qty)).toFixed(2)}`.padStart(12, ' ');
    sendText(`${qtyStr}${descStr}${totalStr}\n`);
  });

  sendText(`--------------------------------\n`);
  send([ESC, 0x61, 0x02]);
  sendText(`SUBTOTAL: $${subtotal.toFixed(2)}\n`);
  sendText(`IVA: $${ivaTotal.toFixed(2)}\n`);
  send([ESC, 0x21, 0x10]);
  sendText(`TOTAL: $${grandTotal.toFixed(2)}\n`);
  send([ESC, 0x21, 0x00]);

  send([ESC, 0x61, 0x01]);
  sendText(`--------------------------------\n`);
  sendText(`!Gracias por su compra!\n`);
  sendText(`\n\n\n\n`);
  send([GS, 0x56, 0x41, 0x00]); 

  return new Uint8Array(data);
}

export async function imprimirTicketBluetooth58mm(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante) {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES
  });

  if (!device) throw new Error("No device selected");

  const payload = buildEscposPayload(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante);
  const server = await device.gatt.connect();
  
  try {
    const writeChar = await findWriteCharacteristic(server);
    const chunkSize = 20;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      if (writeChar.properties.writeWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk);
      } else {
        await writeChar.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 15));
    }
    return true;
  } finally {
    server.disconnect();
  }
}
