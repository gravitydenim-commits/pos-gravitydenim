/**
 * bluetoothPrinter.js
 * Módulo para manejar impresión térmica en ESC/POS (58mm) vía Bluetooth Clásico.
 * Utiliza el puente nativo window.AndroidBluetooth inyectado por la aplicación contenedora Android (WebView).
 */

class BluetoothPrinter {
  // --- COMANDOS ESC/POS BÁSICOS ---
  ESC = "\x1B";
  GS = "\x1D";
  
  cmds = {
    INIT: "\x1B\x40", // Initialize
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
   * Elimina tildes y caracteres especiales
   */
  normalizeText(text) {
    if (!text) return "";
    return text.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "N");
  }

  /**
   * Convierte un string con comandos ESC/POS a Uint8Array
   */
  stringToBuffer(str) {
    let arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i) & 0xFF;
    }
    return arr;
  }

  /**
   * Genera el recibo formateado a 58mm (aprox 32 chars por línea)
   */
  generateReceiptData(invoiceData) {
    let raw = this.cmds.INIT;
    
    // Cabecera
    raw += this.cmds.ALIGN_CENTER;
    raw += this.cmds.BOLD_ON;
    raw += this.cmds.DOUBLE_BOTH;
    raw += this.normalizeText(invoiceData.issuerName) + this.cmds.FEED_LINE;
    raw += this.cmds.NORMAL_SIZE;
    raw += "RUC: " + (invoiceData.issuerRuc || "9999999999001") + this.cmds.FEED_LINE;
    raw += this.cmds.BOLD_OFF;
    raw += this.normalizeText(invoiceData.issuerAddress || "Gravity Denim POS") + this.cmds.FEED_LINE;
    raw += "--------------------------------" + this.cmds.FEED_LINE;

    // Datos del comprobante
    raw += this.cmds.ALIGN_LEFT;
    raw += (invoiceData.isNotaVenta ? "NOTA DE VENTA" : "FACTURA") + this.cmds.FEED_LINE;
    raw += "Ref: " + (invoiceData.numeroComprobante || 'S/N') + this.cmds.FEED_LINE;
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
        let cant = String(item.cantidad || item.qty).padEnd(4, ' ');
        let nombre = this.normalizeText(item.nombre || item.name).substring(0, 20).padEnd(20, ' ');
        let tot = "$" + Number((item.cantidad || item.qty) * (item.precio || item.price)).toFixed(2);
        tot = tot.padStart(8, ' ');
        raw += cant + nombre + tot + this.cmds.FEED_LINE;
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

    // Pie de página
    raw += this.cmds.ALIGN_CENTER;
    raw += "M. Pago: " + (invoiceData.paymentMethod || "EFECTIVO") + this.cmds.FEED_LINE;
    raw += this.cmds.FEED_LINE;
    raw += "¡Gracias por su compra!" + this.cmds.FEED_LINE;
    raw += "\n\n\n\n";

    return this.stringToBuffer(raw);
  }

  /**
   * Conecta a la impresora nativa Android
   */
  async connect() {
    if (!window.AndroidBluetooth) {
      throw new Error("El puente nativo window.AndroidBluetooth no está inyectado en este navegador.");
    }
    const result = await window.AndroidBluetooth.connect();
    if (result === 'OK') return true;
    throw new Error(result);
  }

  /**
   * Envía los datos binarios como Base64 a la interfaz nativa
   */
  async sendData(buffer) {
    if (!window.AndroidBluetooth) {
      throw new Error("El puente nativo window.AndroidBluetooth no está disponible.");
    }
    const base64String = btoa(String.fromCharCode.apply(null, buffer));
    return await window.AndroidBluetooth.printBase64(base64String);
  }

  /**
   * Imprime un ticket de prueba
   */
  async printTest() {
    let raw = this.cmds.INIT;
    raw += this.cmds.ALIGN_CENTER;
    raw += this.cmds.DOUBLE_BOTH;
    raw += "GRAVITY DENIM PRUEBA" + this.cmds.FEED_LINE;
    raw += this.cmds.NORMAL_SIZE;
    raw += "58mm ESC/POS Nativo Android" + this.cmds.FEED_LINE;
    raw += "--------------------------------" + this.cmds.FEED_LINE;
    raw += "Si puedes leer esto, el puente" + this.cmds.FEED_LINE;
    raw += "nativo Bluetooth funciona" + this.cmds.FEED_LINE;
    raw += "correctamente." + this.cmds.FEED_LINE;
    raw += "\n\n\n\n";
    
    await this.connect();
    await this.sendData(this.stringToBuffer(raw));
  }

  /**
   * Imprime un ticket de venta
   */
  async imprimirTicket58mm(issuerData, clientData, cartItems, subtotal, ivaTotal, grandTotal, comprobante, paymentMethod) {
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

    const buffer = this.generateReceiptData(formattedData);
    await this.connect();
    await this.sendData(buffer);
  }
}

export const bluetoothPrinter = new BluetoothPrinter();
