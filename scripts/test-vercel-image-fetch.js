process.env.TZ = 'America/Guayaquil';

async function testVercelImages() {
  console.log("⏳ Esperando 15 segundos a que Vercel termine el despliegue del commit ac35159...");
  await new Promise(r => setTimeout(r, 15000));

  const domain = 'https://pos-gravitydenim.vercel.app';
  const testImages = [
    '/product-illustrations/3d/jean_recto_3d.png',
    '/product-illustrations/3d/camisa_gabardina_3d.png',
    '/product-illustrations/3d/jogger_3d.png',
    '/product-illustrations/3d/default_3d.png'
  ];

  console.log(`\n🌐 Probando imágenes publicadas en Vercel (${domain}):`);
  for (const imgPath of testImages) {
    try {
      const url = `${domain}${imgPath}`;
      const res = await fetch(url, { method: 'HEAD' });
      console.log(`  - ${imgPath} -> HTTP ${res.status} ${res.ok ? '✅ OK' : '❌ FALLÓ'}`);
    } catch (err) {
      console.error(`  - ${imgPath} -> Error: ${err.message}`);
    }
  }
}

testVercelImages().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
