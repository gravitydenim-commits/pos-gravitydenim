// Diagnóstico de la función nowISO() de osodreamer-sri-xml-signer
// Simula exactamente lo que hace la librería

const date = new Date();
console.log('=== DIAGNÓSTICO DE ZONA HORARIA ===');
console.log('');
console.log('1. Hora UTC del servidor:       ', date.toISOString());
console.log('2. Hora local del servidor:     ', date.toString());
console.log('3. getTimezoneOffset():         ', date.getTimezoneOffset(), 'minutos');
console.log('   (Offset positivo = oeste de UTC, negativo = este)');
console.log('');

// Reproducir la lógica exacta de osodreamer
const localOffset = date.getTimezoneOffset();
const desiredOffset = 300; // UTC-5 (Ecuador) = 300 minutos
const targetDate = localOffset === desiredOffset 
  ? date 
  : new Date(date.getTime() + (desiredOffset - localOffset) * 60000);

const y = targetDate.getFullYear();
const mo = String(targetDate.getMonth() + 1).padStart(2, '0');
const d = String(targetDate.getDate()).padStart(2, '0');
const h = String(targetDate.getHours()).padStart(2, '0');
const mi = String(targetDate.getMinutes()).padStart(2, '0');
const s = String(targetDate.getSeconds()).padStart(2, '0');
const signingTime = `${y}-${mo}-${d}T${h}:${mi}:${s}-05:00`;

console.log('4. localOffset (este servidor): ', localOffset, 'min');
console.log('5. desiredOffset (Ecuador):      300 min (UTC-5)');
console.log('6. Diferencia aplicada:         ', (desiredOffset - localOffset), 'minutos');
console.log('7. targetDate resultante:       ', targetDate.toString());
console.log('');
console.log('=== SigningTime que se inserta en la firma XAdES ===');
console.log('   ', signingTime);
console.log('');

// Verificar si la hora es correcta
const ecuadorNow = new Date(date.getTime() - 5 * 60 * 60 * 1000);
const correctTime = `${ecuadorNow.getUTCFullYear()}-${String(ecuadorNow.getUTCMonth()+1).padStart(2,'0')}-${String(ecuadorNow.getUTCDate()).padStart(2,'0')}T${String(ecuadorNow.getUTCHours()).padStart(2,'0')}:${String(ecuadorNow.getUTCMinutes()).padStart(2,'0')}:${String(ecuadorNow.getUTCSeconds()).padStart(2,'0')}-05:00`;
console.log('=== HORA CORRECTA DE ECUADOR (referencia) ===');
console.log('   ', correctTime);
console.log('');

if (signingTime === correctTime) {
  console.log('✅ La hora del SigningTime COINCIDE con la hora real de Ecuador.');
} else {
  console.log('❌ LA HORA DEL SIGNINGTIME NO COINCIDE CON LA HORA REAL DE ECUADOR');
  console.log('');
  
  // Analizar la causa
  console.log('=== ANÁLISIS DEL BUG ===');
  console.log('La librería osodreamer hace:');
  console.log('  new Date(date.getTime() + (desiredOffset - localOffset) * 60000)');
  console.log('');
  console.log('  date.getTime()  =', date.getTime());
  console.log('  desiredOffset   = 300 (Ecuador UTC-5)');
  console.log('  localOffset     =', localOffset, `(${localOffset > 0 ? 'oeste' : 'este'} de UTC)`);
  console.log('  Ajuste          = (300 -', localOffset, ') * 60000 =', (desiredOffset - localOffset) * 60000, 'ms =', (desiredOffset - localOffset), 'minutos');
  console.log('');
  
  if (localOffset < 0) {
    console.log('⚠️  PROBLEMA: Este servidor está en timezone UTC+' + (-localOffset/60));
    console.log('   La fórmula SUMA ' + (desiredOffset - localOffset) + ' minutos, lo que produce una fecha FUTURA.');
    console.log('   Esto es un BUG en la librería osodreamer cuando el servidor está en UTC+ (ej. Vercel puede estar en UTC o UTC+).');
  }
  
  if (localOffset === 0) {
    console.log('⚠️  PROBLEMA: Este servidor está en UTC (offset=0), como es típico en Vercel.');
    console.log('   La fórmula hace: new Date(time + 300*60000) = SUMA 5 horas en vez de RESTAR 5 horas.');
    console.log('   Resultado: genera una fecha 10 horas adelante de Ecuador → EL SRI LA RECHAZA COMO FUTURA.');
  }
}
