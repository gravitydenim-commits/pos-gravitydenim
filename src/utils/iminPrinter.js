// ============================================================================
// IMIN SWAN 2 INTEGRATED PRINTER UTILITY
// ============================================================================
//
// Supports printing directly to the built-in iMin Swan 2 thermal printer
// (DS2-25 / I24D03) using the official injected Android SDK bridge
// (window.IminPrinter) or iMin Local Web Service daemon (port 13911).
//
// ============================================================================

export async function printTicketImin(issuerData, cartItems, totalsData, customerData, claveAcceso, paymentMethod, isNotaVenta, paymentDetails = null) {
  console.log("🖨️ iMin Swan 2: Iniciando impresión térmica directa...");

  const cleanText = (str) => {
    return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const padText = (left, right, width = 48) => {
    const spacing = width - left.length - right.length;
    return left + ' '.repeat(spacing > 0 ? spacing : 1) + right;
  };

  const divider = '-'.repeat(48);
  const doubleDivider = '='.repeat(48);

  const lines = [];

  // Build the receipt payload
  const title = isNotaVenta ? 'NOTA DE VENTA' : 'FACTURA ELECTRONICA';
  const name = cleanText(isNotaVenta ? 'GRAVITY DENIM' : (issuerData.razonSocial || issuerData.name || ''));
  const commercial = cleanText(issuerData.nombreComercial || '');
  const ruc = issuerData.ruc || '';
  const address = cleanText(issuerData.direccionMatriz || '');
  const estabAddress = cleanText(issuerData.direccionEstablecimiento || address);

  lines.push({ text: name, size: 28, align: 1, bold: true });
  if (commercial && commercial !== name) {
    lines.push({ text: commercial, size: 20, align: 1 });
  }
  lines.push({ text: `RUC: ${ruc}`, size: 20, align: 1 });
  lines.push({ text: `Matriz: ${address}`, size: 18, align: 1 });
  if (estabAddress && estabAddress !== address) {
    lines.push({ text: `Establecimiento: ${estabAddress}`, size: 18, align: 1 });
  }
  lines.push({ text: divider, size: 18, align: 1 });

  lines.push({ text: title, size: 24, align: 1, bold: true });
  if (isNotaVenta) {
    lines.push({ text: "*** DOCUMENTO SIN VALOR TRIBUTARIO ***", size: 18, align: 1, bold: true });
    lines.push({ text: `No. ${claveAcceso}`, size: 20, align: 1, bold: true });
  } else {
    const formattedNo = claveAcceso.length === 49 ? `${claveAcceso.substring(24, 27)}-${claveAcceso.substring(27, 30)}-${claveAcceso.substring(30, 39)}` : claveAcceso;
    lines.push({ text: `No. ${formattedNo}`, size: 20, align: 1, bold: true });
    lines.push({ text: `F. Emision: ${new Date().toLocaleString('es-EC')}`, size: 18, align: 0 });
    lines.push({ text: `Ambiente: ${(claveAcceso[23] === '2' || issuerData.ambiente === '2') ? 'PRODUCCION (2)' : 'PRUEBAS (1)'}`, size: 18, align: 0 });
    lines.push({ text: `Emision: NORMAL`, size: 18, align: 0 });
    lines.push({ text: `Clave Acceso:`, size: 18, align: 0 });
    lines.push({ text: claveAcceso, size: 14, align: 0 });
  }

  lines.push({ text: divider, size: 18, align: 1 });
  lines.push({ text: `CLIENTE: ${cleanText(customerData.nombre || 'CONSUMIDOR FINAL')}`, size: 18, align: 0 });
  lines.push({ text: `RUC/CI: ${customerData.numeroIdentificacion || '9999999999999'}`, size: 18, align: 0 });
  lines.push({ text: `Direccion: ${cleanText(customerData.direccion || 'S/N')}`, size: 18, align: 0 });
  lines.push({ text: `Correo: ${cleanText(customerData.correo || 'S/N')}`, size: 18, align: 0 });
  lines.push({ text: `Vendedor: ${cleanText(issuerData.razonSocial || issuerData.name || 'PUNTO DE VENTA')}`, size: 18, align: 0 });
  lines.push({ text: divider, size: 18, align: 1 });

  // Columns: Qty (5), Description (27), Price (8), Total (8) -> Total Width: 48
  lines.push({ text: padText('CANT  DESCRIPCION', 'P.UNIT   TOTAL', 48), size: 18, align: 0, bold: true });
  lines.push({ text: divider, size: 18, align: 1 });

  cartItems.forEach(item => {
    const qty = String(item.qty || item.cantidad || 1);
    const name = cleanText(item.name || item.nombre || '');
    const price = `$${Number(item.price || item.precio || 0).toFixed(2)}`;
    const total = `$${Number((item.price || item.precio || 0) * (item.qty || item.cantidad || 1) - (item.descuento || 0)).toFixed(2)}`;

    // Format item line
    const descPart = name.substring(0, 22);
    const leftText = `${qty.padEnd(4)}  ${descPart.padEnd(22)}`;
    lines.push({ text: padText(leftText, `${price.padStart(8)} ${total.padStart(8)}`, 48), size: 18, align: 0 });
    if (item.descuento > 0) {
      lines.push({ text: `   * Desc: -$${Number(item.descuento).toFixed(2)}`, size: 14, align: 0 });
    }
  });

  lines.push({ text: divider, size: 18, align: 1 });
  lines.push({ text: padText('SUBTOTAL:', `$${Number(totalsData.subtotal || 0).toFixed(2)}`, 48), size: 18, align: 0 });
  lines.push({ text: padText('DESCUENTOS:', `$${Number(totalsData.totalDescuentos || 0).toFixed(2)}`, 48), size: 18, align: 0 });
  lines.push({ text: padText('IVA 15%:', `$${Number(totalsData.ivaAmount || 0).toFixed(2)}`, 48), size: 18, align: 0 });
  lines.push({ text: padText('TOTAL:', `$${Number(totalsData.total || 0).toFixed(2)}`, 48), size: 22, align: 0, bold: true });
  lines.push({ text: doubleDivider, size: 18, align: 1 });

  // Payment Details
  lines.push({ text: 'DETALLE DE PAGO:', size: 18, align: 0, bold: true });
  if (paymentDetails && paymentDetails.payments && paymentDetails.payments.length > 0) {
    paymentDetails.payments.forEach(p => {
      lines.push({ text: padText(`- ${p.method}:`, `$${Number(p.amount || 0).toFixed(2)}`, 48), size: 18, align: 0 });
    });
  } else {
    lines.push({ text: padText(`- ${paymentMethod}:`, `$${Number(totalsData.total || 0).toFixed(2)}`, 48), size: 18, align: 0 });
  }

  lines.push({ text: divider, size: 18, align: 1 });
  lines.push({ text: '¡GRACIAS POR SU COMPRA!', size: 20, align: 1, bold: true });
  lines.push({ text: 'Gravity Denim - Calidad Excepcional', size: 16, align: 1 });
  lines.push({ text: '\n\n\n\n', size: 18, align: 1 }); // Spacing feed

  // 0. Try AndroidBridge.printTicket if available in container APK
  if (typeof window !== 'undefined' && window.AndroidBridge) {
    try {
      const payload = {
        lines,
        rawText: lines.map(l => l.text).join('\n') + '\n\n\n\n',
        numeroComprobante: claveAcceso,
        isNotaVenta
      };
      
      let res;
      if (typeof window.AndroidBridge.printTicket === 'function') {
        res = window.AndroidBridge.printTicket(JSON.stringify(payload));
      } else {
        alert("⚠️ AndroidBridge existe pero NO expone printTicket(). Métodos disponibles:\n" + Object.keys(window.AndroidBridge).join(', '));
        return false;
      }
      
      if (window.AndroidBridge.showToast) {
        window.AndroidBridge.showToast("🖨️ Enviando impresión nativa...");
      }
      return true;
    } catch (bridgeErr) {
      alert("❌ Error invocando window.AndroidBridge.printTicket:\n" + (bridgeErr.message || String(bridgeErr)));
      return false;
    }
  }

  // 2. Try HTTP Daemon service on iMin devices (standard port 13911 or custom local service)
  try {
    const rawText = lines.map(l => l.text).join('\n') + '\n\n\n\n';
    const response = await fetch('http://127.0.0.1:13911/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText })
    });
    if (response.ok) {
      console.log("✅ iMin Swan 2: Impreso vía Daemon Port 13911 con éxito.");
      return true;
    }
  } catch (httpErr) {
    console.warn("Daemon local iMin 13911 no disponible.");
  }

  console.warn("⚠️ No se detectó hardware de impresión iMin direct (SDK/Daemon). Evitando diálogo de sistema.");
  return false;
}
