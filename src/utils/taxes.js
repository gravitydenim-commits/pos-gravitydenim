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
