import dns from 'dns';

const domains = [
  'www.sri.gob.ec',
  'sri.gob.ec',
  'sri.gob.ec',
  'sri.gob.ec',
  'sriaenlinea.sri.gob.ec',
  'sri.gob.ec',
  'facturacion.sri.gob.ec',
  'sricatastro.sri.gob.ec'
];

async function checkDns() {
  console.log("🌐 PROBANDO DOMINIOS SRI COMPLETO:");
  for (const domain of domains) {
    dns.lookup(domain, (err, address) => {
      if (err) {
        console.log(`  - ${domain} -> ❌ DNS Error: ${err.message}`);
      } else {
        console.log(`  - ${domain} -> ✅ IP: ${address}`);
      }
    });
  }
}

checkDns();
