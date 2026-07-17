/**
 * Printer58Service.js
 * Servicio independiente de impresión para impresoras térmicas de 58 mm (ESC/POS) vía Web Bluetooth.
 * Diseñado específicamente para el modelo CRM-03 (Print001) y similares.
 */

class Printer58Service {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    this.PRINTER_SERVICES = [
      '000018f0-0000-1000-8000-00805f9b34fb', // Generico 1
      '49535343-fe7d-4ae5-8fa9-9fafd205e455'  // Generico 2 (ISSC)
    ];
  }

  // --- COMANDOS ESC/POS BÁSICOS ---
  ESC = "\x1B";
  GS = "\x1D";
  
  cmds = {
    INIT: "\x1B\x40",
    ALIGN_LEFT: "\x1B\x61\x00",
    ALIGN_CENTER: "\x1B\x61\x01",
    ALIGN_RIGHT: "\x1B\x61\x02",
    BOLD_ON: "\x1B\x45\x01",
    BOLD_OFF: "\x1B\x45\x00",
    DOUBLE_HEIGHT: "\x1B\x21\x10",
    DOUBLE_WIDTH: "\x1B\x21\x20",
    DOUBLE_BOTH: "\x1B\x21\x30",
    NORMAL_SIZE: "\x1B\x21\x00",
    FEED_LINE: "\x0A"
  };

  /**
   * Limpia y normaliza texto para CP437 (ASCII)
   */
  normalizeText(text) {
    if (!text) return "";
    return text.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "N")
      .replace(/[^\x20-\x7E\n]/g, ""); // Filtra todo lo que no sea ASCII imprimible
  }

  /**
   * Convierte un string a Uint8Array
   */
  stringToBuffer(str) {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i) & 0xFF;
    }
    return arr;
  }

  /**
   * Solicita el dispositivo Bluetooth la primera vez
   */
  async requestDevice() {
    if (!navigator.bluetooth) {
      throw new Error("Este navegador o dispositivo no soporta la API Web Bluetooth (se requiere HTTPS).");
    }

    console.log("Solicitando dispositivo Bluetooth...");
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: 'Print001' },
        { namePrefix: 'Print' },
        { namePrefix: 'Printer' }
      ],
      optionalServices: this.PRINTER_SERVICES
    });

    this.device = device;
    localStorage.setItem('printer58_device_name', device.name || 'Print001');
    return device;
  }

  /**
   * Conecta al dispositivo GATT
   */
  async connect() {
    if (this.characteristic && this.device && this.device.gatt.connected) {
      return true;
    }

    if (!this.device) {
      // Si no tenemos el objeto en memoria, intentamos requestDevice
      await this.requestDevice();
    }

    console.log("Conectando al servidor GATT...");
    this.server = await this.device.gatt.connect();

    console.log("Buscando servicios de impresión...");
    for (const serviceUuid of this.PRINTER_SERVICES) {
      try {
        this.service = await this.server.getPrimaryService(serviceUuid);
        break;
      } catch (e) {
        // Continuar buscando
      }
    }

    if (!this.service) {
      // Si fallan los específicos, intentamos conseguir el primero que esté disponible
      try {
        const services = await this.server.getPrimaryServices();
        if (services.length > 0) this.service = services[0];
      } catch (e) {
        throw new Error("No se pudo obtener el servicio primario de la impresora.");
      }
    }

    if (!this.service) {
      throw new Error("La impresora no expone servicios compatibles de impresión.");
    }

    console.log("Buscando característica de escritura...");
    const characteristics = await this.service.getCharacteristics();
    this.characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

    if (!this.characteristic) {
      throw new Error("No se encontró la característica de escritura en la impresora.");
    }

    console.log("Conectado con éxito a 58mm.");
    return true;
  }

  /**
   * Envía los datos en chunks
   */
  async sendBuffer(buffer) {
    if (!this.characteristic) {
      throw new Error("La impresora no está conectada.");
    }
    const chunkSize = 20; // Tamaño de chunk estándar seguro para BLE
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize);
      await this.characteristic.writeValue(chunk);
    }
  }

  /**
   * Genera el recibo en formato binario
   */
  generateReceipt(invoiceData) {
    let raw = this.cmds.INIT;
    
    // Cabecera
    raw += this.cmds.ALIGN_CENTER;
    raw += this.cmds.BOLD_ON;
    raw += this.cmds.DOUBLE_BOTH;
    raw += this.normalizeText(invoiceData.issuerName) + this.cmds.FEED_LINE;
    raw += this.cmds.NORMAL_SIZE;
    raw += "RUC: " + (invoiceData.issuerRuc || "0000000000001") + this.cmds.FEED_LINE;
    raw += this.cmds.BOLD_OFF;
    raw += this.normalizeText(invoiceData.issuerAddress || "Punto de Venta") + this.cmds.FEED_LINE;
    raw += "--------------------------------" + this.cmds.FEED_LINE;

    // Datos del comprobante
    raw += this.cmds.ALIGN_LEFT;
    if (invoiceData.isNotaVenta) {
      raw += "NOTA DE VENTA" + this.cmds.FEED_LINE;
      raw += this.cmds.ALIGN_CENTER;
      raw += "*** DOCUMENTO SIN VALOR TRIBUTARIO ***" + this.cmds.FEED_LINE;
      raw += this.cmds.ALIGN_LEFT;
    } else {
      raw += "FACTURA ELECTRONICA" + this.cmds.FEED_LINE;
    }
    raw += "No. " + (invoiceData.numeroComprobante || 'S/N') + this.cmds.FEED_LINE;
    raw += "Fecha: " + new Date().toLocaleString('es-EC') + this.cmds.FEED_LINE;
    raw += "Cliente: " + this.normalizeText(invoiceData.customerName) + this.cmds.FEED_LINE;
    raw += "RUC/CI: " + invoiceData.customerId + this.cmds.FEED_LINE;
    raw += "--------------------------------" + this.cmds.FEED_LINE;
    
    // Detalle de productos
    raw += this.cmds.BOLD_ON;
    raw += "CANT DETALLE               TOTAL" + this.cmds.FEED_LINE;
    raw += this.cmds.BOLD_OFF;

    if (invoiceData.items && invoiceData.items.length > 0) {
      invoiceData.items.forEach(item => {
        const qty = String(item.cantidad || item.qty || 1).padEnd(4, ' ');
        const nombre = this.normalizeText(item.nombre || item.name).substring(0, 20).padEnd(20, ' ');
        const tot = "$" + Number((item.cantidad || item.qty || 1) * (item.precio || item.price || 0)).toFixed(2);
        raw += qty + nombre + tot.padStart(8, ' ') + this.cmds.FEED_LINE;
      });
    }
    raw += "--------------------------------" + this.cmds.FEED_LINE;

    // Totales
    raw += this.cmds.ALIGN_RIGHT;
    raw += "Subtotal: $" + Number(invoiceData.totals.subtotal).toFixed(2) + this.cmds.FEED_LINE;
    if (invoiceData.totals.ivaAmount > 0) {
      raw += "IVA: $" + Number(invoiceData.totals.ivaAmount).toFixed(2) + this.cmds.FEED_LINE;
    }
    raw += this.cmds.BOLD_ON;
    raw += this.cmds.DOUBLE_HEIGHT;
    raw += "TOTAL: $" + Number(invoiceData.totals.total).toFixed(2) + this.cmds.FEED_LINE;
    raw += this.cmds.NORMAL_SIZE;
    raw += this.cmds.BOLD_OFF;
    raw += this.cmds.FEED_LINE;

    // Pie
    raw += this.cmds.ALIGN_CENTER;
    raw += "M. Pago: " + (invoiceData.paymentMethod || "EFECTIVO") + this.cmds.FEED_LINE;
    raw += this.cmds.FEED_LINE;
    raw += "¡Gracias por su compra!" + this.cmds.FEED_LINE;
    raw += "\n\n\n\n";

    return this.stringToBuffer(raw);
  }

  /**
   * Método de prueba de 58 mm
   */
  async printTest() {
    await this.connect();
    let raw = this.cmds.INIT;
    raw += this.cmds.ALIGN_CENTER;
    raw += this.cmds.DOUBLE_BOTH;
    raw += "GRAVITY DENIM" + this.cmds.FEED_LINE;
    raw += this.cmds.NORMAL_SIZE;
    raw += "Prueba CRM-03 (Print001)" + this.cmds.FEED_LINE;
    raw += "--------------------------------" + this.cmds.FEED_LINE;
    raw += "Impresión de prueba directa" + this.cmds.FEED_LINE;
    raw += "58mm ESC/POS Web Bluetooth" + this.cmds.FEED_LINE;
    raw += "exitosa." + this.cmds.FEED_LINE;
    raw += "\n\n\n\n";

    await this.sendBuffer(this.stringToBuffer(raw));
  }

  /**
   * Imprime un ticket de venta real
   */
  async printTicket(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante, paymentMethod) {
    const formattedData = {
      issuerName: issuerData.razonSocial || issuerData.name,
      issuerRuc: issuerData.ruc,
      issuerAddress: issuerData.direccionMatriz || issuerData.address,
      numeroComprobante: comprobante?.numeroComprobante || comprobante?.claveAcceso?.substring(24, 39) || 'S/N',
      customerName: clientData.nombre,
      customerId: clientData.numeroIdentificacion,
      isNotaVenta: comprobante?.isNotaVenta,
      items: cartItems,
      totals: {
        subtotal,
        ivaAmount: ivaTotal,
        total: grandTotal
      },
      paymentMethod
    };

    const buffer = this.generateReceipt(formattedData);
    await this.connect();
    await this.sendBuffer(buffer);
  }
}

export const printer58Service = new Printer58Service();
