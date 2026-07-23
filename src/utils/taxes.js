/**
 * Configuración centralizada de impuestos del SRI (Ecuador)
 * Permite evitar el hardcoding de tasas tributarias e IVA.
 */
export const TAX_CONFIG = {
  IVA: {
    PERCENTAGE: 0.15,      // Tasa porcentual decimal para cálculos matemáticos (15%)
    RATE: 15.00,          // Tarifa en porcentaje formateado para el SRI (15.00)
    CODE: 4               // Código del SRI: 2 = 12%, 3 = 14%, 4 = 15%, 5 = 5%
  }
};

export const round2 = (val) => Number(Math.round(Number(val + 'e2')) + 'e-2') || Number(Number(val).toFixed(2));

/**
 * Función única y centralizada para cálculo de impuestos SRI y POS.
 * @param {Array} items Array de productos [{ price/precio, qty/cantidad, descuento }]
 * @param {Boolean} vatIncluded True si el precio ya incluye IVA (se desglosa), false si se le suma el IVA
 * @param {Boolean} isNotaVenta True si es Nota de Venta (sin IVA)
 */
export function calculateTotals(items = [], vatIncluded = true, isNotaVenta = false) {
  let subtotalSinImpuestos = 0;
  let valorIva = 0;
  let importeTotal = 0;

  const detalles = items.map(item => {
    const qty = Number(item.qty || item.cantidad || 1);
    const rawPrice = Number(item.price !== undefined ? item.price : (item.precio || 0));
    const descuento = round2(item.descuento || 0);

    let precioUnitarioSinIva = 0;
    let precioTotalSinImpuesto = 0;
    let itemIva = 0;
    let itemTotal = 0;

    if (isNotaVenta) {
      precioUnitarioSinIva = round2(rawPrice);
      precioTotalSinImpuesto = round2((precioUnitarioSinIva * qty) - descuento);
      itemIva = 0;
      itemTotal = precioTotalSinImpuesto;
    } else if (vatIncluded) {
      // IVA incluido: el precio mostrado ya representa el total final con IVA
      itemTotal = round2((rawPrice * qty) - descuento);
      precioTotalSinImpuesto = round2(itemTotal / (1 + TAX_CONFIG.IVA.PERCENTAGE));
      precioUnitarioSinIva = round2(precioTotalSinImpuesto / qty);
      itemIva = round2(itemTotal - precioTotalSinImpuesto);
    } else {
      // IVA no incluido: el precio es subtotal y se le suma el IVA encima
      precioUnitarioSinIva = round2(rawPrice);
      precioTotalSinImpuesto = round2((precioUnitarioSinIva * qty) - descuento);
      itemIva = round2(precioTotalSinImpuesto * TAX_CONFIG.IVA.PERCENTAGE);
      itemTotal = round2(precioTotalSinImpuesto + itemIva);
    }

    subtotalSinImpuestos += precioTotalSinImpuesto;
    valorIva += itemIva;
    importeTotal += itemTotal;

    return {
      id: item.id || item.codigo || '0000',
      nombre: item.name || item.nombre || 'Producto',
      qty,
      precioUnitario: precioUnitarioSinIva,
      descuento,
      precioTotalSinImpuesto,
      iva: itemIva,
      total: itemTotal
    };
  });

  subtotalSinImpuestos = round2(subtotalSinImpuestos);
  valorIva = round2(valorIva);
  importeTotal = round2(importeTotal);

  return {
    subtotal: subtotalSinImpuestos,
    baseImponible: subtotalSinImpuestos,
    ivaAmount: valorIva,
    total: importeTotal,
    detalles
  };
}
