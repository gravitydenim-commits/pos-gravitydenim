import https from 'https';

const ruc = '1803805405001';
const host = 'cel.sri.gob.ec';

const paths = [
  `/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/existePorNumeroRuc?numeroRuc=${ruc}`,
  `/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumeroRuc?numeroRuc=${ruc}`,
  `/sri-catastro-sujeto-servicio-internet/rest/PersonaRuc/obtenerPersonaPorRuc?numeroRuc=${ruc}`,
  `/sri-catastro-sujeto-servicio-internet/rest/ContribuyenteCompleto/consultarPorRuc/${ruc}`,
  `/sri-catastro-sujeto-servicio-internet/rest/CatastroConsultas/consultarRuc?ruc=${ruc}`
];

async function testPaths() {
  console.log(`🔎 Probando endpoints oficiales en https://${host}...`);
  for (const path of paths) {
    await new Promise((resolve) => {
      const req = https.get({
        host,
        path,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        rejectUnauthorized: false,
        timeout: 5000
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          console.log(`  - ${path} -> HTTP ${res.statusCode} ${body.length > 0 ? `(${body.length} bytes)` : ''}`);
          if (res.statusCode === 200) {
            console.log(`    ⭐ RESPUESTA 200 SUCCESS:\n${body.substring(0, 300)}`);
          }
          resolve();
        });
      });

      req.on('error', err => {
        console.log(`  - ${path} -> Error: ${err.message}`);
        resolve();
      });
      req.on('timeout', () => {
        req.destroy();
        console.log(`  - ${path} -> Timeout`);
        resolve();
      });
    });
  }
}

testPaths().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
