const fs = require('fs');
const { execSync } = require('child_process');

console.log("Iniciando configuración automática de variables de entorno para Vercel...");

try {
  if (!fs.existsSync('serviceAccountKey.json')) {
    throw new Error("No se encontró el archivo serviceAccountKey.json en la raíz del proyecto.");
  }

  const serviceAccount = JSON.parse(fs.readFileSync('serviceAccountKey.json', 'utf8'));
  
  const envVars = {
    FIREBASE_PROJECT_ID: serviceAccount.project_id,
    FIREBASE_CLIENT_EMAIL: serviceAccount.client_email,
    FIREBASE_PRIVATE_KEY: serviceAccount.private_key
  };

  for (const [key, value] of Object.entries(envVars)) {
    console.log(`\nConfigurando ${key}...`);
    
    // Eliminamos la variable si ya existe para evitar duplicados/conflictos
    try {
      execSync(`npx vercel env rm ${key} production -y`, { stdio: 'ignore' });
    } catch (e) {
      // Ignorar error si la variable no existía
    }
    
    // Añadimos la nueva variable pasando el valor por entrada estándar (stdin)
    // Esto es crucial para la clave privada que tiene múltiples líneas
    execSync(`npx vercel env add ${key} production`, { 
      input: value, 
      stdio: ['pipe', 'inherit', 'inherit'] 
    });
    console.log(`✅ ${key} configurada correctamente.`);
  }

  console.log("\n🎉 ¡Todas las credenciales han sido subidas a Vercel con éxito!");
  console.log("Por favor, realiza un nuevo despliegue en Vercel (Redeploy) para que tomen efecto.");

} catch (error) {
  console.error("\n❌ Error durante la configuración:", error.message);
  console.log("Asegúrate de haber iniciado sesión en Vercel ejecutando: npx vercel login");
}
