import fs from 'fs';
import path from 'path';

const sourceDir = path.join(process.cwd(), 'public', 'product-illustrations', '3d');
const targetDir = path.join(process.cwd(), 'public', 'images', '3d');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const files = fs.readdirSync(sourceDir);
console.log(`🔄 Copiando ${files.length} archivos de product-illustrations/3d a images/3d...`);

files.forEach(file => {
  const src = path.join(sourceDir, file);
  const dest = path.join(targetDir, file);
  fs.copyFileSync(src, dest);

  // También crear alias sin el sufijo '_3d' para compatibilidad con código antiguo
  if (file.endsWith('_3d.png')) {
    const aliasName = file.replace('_3d.png', '.png');
    const aliasDest = path.join(targetDir, aliasName);
    if (!fs.existsSync(aliasDest)) {
      fs.copyFileSync(src, aliasDest);
      console.log(`  - Alias creado: ${aliasName} <- ${file}`);
    }
  }
});

console.log("✅ Sincronización completada exitosamente.");
