import { calculateTotals } from '../src/utils/taxes.js';

console.log("==================================================");
console.log("🧪 PRUEBA DE CÁLCULO DE IMPUESTOS (TAX MATH TEST)");
console.log("==================================================");

// CASO 1: IVA Incluido (vatIncluded = true)
const items1 = [{ price: 5.00, qty: 1 }];
const res1 = calculateTotals(items1, true, false);

console.log("\n1. CASO IVA INCLUIDO (Precio: $5.00):");
console.log(`   - Subtotal 15%: $${res1.subtotal.toFixed(2)} (Esperado: $4.35)`);
console.log(`   - IVA 15%:      $${res1.ivaAmount.toFixed(2)} (Esperado: $0.65)`);
console.log(`   - Total Final:  $${res1.total.toFixed(2)} (Esperado: $5.00)`);

const pass1 = res1.subtotal === 4.35 && res1.ivaAmount === 0.65 && res1.total === 5.00;
console.log(`   Resultado: ${pass1 ? '✅ APROBADO' : '❌ FALLÓ'}`);

// CASO 2: IVA No Incluido (vatIncluded = false)
const items2 = [{ price: 5.00, qty: 1 }];
const res2 = calculateTotals(items2, false, false);

console.log("\n2. CASO MÁS IVA (+15%) (Precio: $5.00):");
console.log(`   - Subtotal 15%: $${res2.subtotal.toFixed(2)} (Esperado: $5.00)`);
console.log(`   - IVA 15%:      $${res2.ivaAmount.toFixed(2)} (Esperado: $0.75)`);
console.log(`   - Total Final:  $${res2.total.toFixed(2)} (Esperado: $5.75)`);

const pass2 = res2.subtotal === 5.00 && res2.ivaAmount === 0.75 && res2.total === 5.75;
console.log(`   Resultado: ${pass2 ? '✅ APROBADO' : '❌ FALLÓ'}`);

console.log("\n==================================================");
if (pass1 && pass2) {
  console.log("🎉 TODAS LAS PRUEBAS MATEMÁTICAS PASARON PERFECTAMENTE");
  process.exit(0);
} else {
  console.error("❌ OCURRIÓ UN ERROR EN LOS CÁLCULOS");
  process.exit(1);
}
