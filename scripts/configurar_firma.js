const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('--- Configuración de Firma Electrónica SRI ---');

rl.question('1. Arrastra aquí tu archivo .p12 (o escribe la ruta completa): ', (p12Path) => {
  const cleanPath = p12Path.trim().replace(/^['"]|['"]$/g, '');
  
  if (!fs.existsSync(cleanPath)) {
    console.error(`❌ Error: No se encontró el archivo en la ruta: ${cleanPath}`);
    rl.close();
    return;
  }

  rl.question('2. Escribe la contraseña de la firma electrónica: ', (password) => {
    try {
      const p12Buffer = fs.readFileSync(cleanPath);
      const p12Base64 = p12Buffer.toString('base64');
      
      const envPath = path.join(__dirname, '..', '.env.local');
      let envContent = '';
      
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      
      // Update or append variables
      if (envContent.includes('SRI_FIRMA_P12_BASE64=')) {
        envContent = envContent.replace(/SRI_FIRMA_P12_BASE64=.*/, `SRI_FIRMA_P12_BASE64="${p12Base64}"`);
      } else {
        envContent += `\nSRI_FIRMA_P12_BASE64="${p12Base64}"\n`;
      }

      if (envContent.includes('SRI_FIRMA_PASSWORD=')) {
        envContent = envContent.replace(/SRI_FIRMA_PASSWORD=.*/, `SRI_FIRMA_PASSWORD="${password.trim()}"`);
      } else {
        envContent += `SRI_FIRMA_PASSWORD="${password.trim()}"\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ ¡Éxito! La firma electrónica y contraseña han sido guardadas de forma segura en .env.local.');
      console.log('Reinicia tu servidor (Cierra esta consola y vuelve a correr "npm run dev") para aplicar los cambios.');
    } catch (err) {
      console.error('❌ Error al procesar el archivo:', err);
    }
    
    rl.close();
  });
});
