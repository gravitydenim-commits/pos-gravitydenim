import https from 'https';

function fetchSriRuc(ruc) {
  return new Promise((resolve, reject) => {
    const queryRuc = ruc.length === 10 ? `${ruc}001` : ruc;
    const url = `https://www.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumeroRuc?numeroRuc=${queryRuc}`;

    console.log(`🌐 Consultando SRI API Oficial: ${url}`);
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*'
      },
      rejectUnauthorized: false,
      timeout: 8000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`HTTP Status SRI: ${res.statusCode}`);
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          resolve({ raw: body, status: res.statusCode });
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error("Timeout al conectar con SRI"));
    });
  });
}

async function test() {
  try {
    const data = await fetchSriRuc('1803805405001');
    console.log("✅ Respuesta SRI Data:\n", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("❌ Error en consulta SRI:", err.message);
  }
}

test().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
