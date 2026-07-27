import bwipjs from 'bwip-js';

async function testBarcode() {
  const clave = '2307202601180380540500120010010000000022307002314';
  const pngBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: clave,
    scale: 3,
    height: 10,
    includetext: false
  });
  console.log(`✅ Código de barras Code 128 generado exitosamente. Tamaños: ${pngBuffer.length} bytes.`);
}

testBarcode().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
