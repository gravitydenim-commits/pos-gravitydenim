async function testVercelImages3D() {
  const domain = 'https://pos-gravitydenim.vercel.app';
  const urls = [
    '/images/3d/jean.png',
    '/images/3d/polo.png',
    '/images/3d/camisa.png',
    '/images/3d/blusa.png',
    '/images/3d/default.png',
    '/product-illustrations/3d/jean_recto_3d.png'
  ];

  console.log("🌐 PROBANDO RUTAS EN VERCEL:");
  for (const path of urls) {
    try {
      const res = await fetch(`${domain}${path}`, { method: 'HEAD' });
      console.log(`  - ${path} -> HTTP ${res.status} ${res.ok ? '✅ OK' : '❌ 404'}`);
    } catch (e) {
      console.error(`  - ${path} -> Error: ${e.message}`);
    }
  }
}

testVercelImages3D().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
