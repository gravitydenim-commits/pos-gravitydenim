import https from 'https';

const ruc = '1803805405001';

function testSriUrl(urlStr) {
  return new Promise((resolve) => {
    console.log(`🌐 Probando: ${urlStr}`);
    const u = new URL(urlStr);
    
    const req = https.get({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
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
        console.log(`  - Status: ${res.statusCode}`);
        console.log(`  - Body: ${body.substring(0, 300)}`);
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', err => {
      console.log(`  - Error: ${err.message}`);
      resolve({ error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      console.log(`  - Timeout`);
      resolve({ error: 'Timeout' });
    });
  });
}

async function main() {
  await testSriUrl(`https://www.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/existePorNumeroRuc?numeroRuc=${ruc}`);
  await testSriUrl(`https://sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/existePorNumeroRuc?numeroRuc=${ruc}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
