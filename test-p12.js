const admin = require('firebase-admin');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function runTest() {
  try {
    console.log('1. Buscando certificado en Firestore...');
    const snap = await db.collection('issuers_secrets').limit(1).get();
    
    if (snap.empty) {
      console.log('❌ NO HAY ISSUERS SECRETS GUARDADOS.');
      return;
    }
    const data = snap.docs[0].data();
    console.log('✅ Secreto encontrado para el emisor:', snap.docs[0].id);
    
    if (!data.p12Base64 || !data.password) {
       console.log('❌ Faltan credenciales (p12Base64 o password).');
       return;
    }
    
    console.log('2. Decodificando P12 Base64...');
    const p12Buffer = Buffer.from(data.p12Base64, 'base64');
    console.log(`   - Tamaño del buffer: ${p12Buffer.length} bytes`);
    
    console.log('3. Parseando estructura ASN1...');
    const forge = require('node-forge');
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    console.log('   - ASN1 parseado correctamente.');
    
    console.log('4. Intentando abrir P12 con la contraseña guardada...');
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, data.password);
    console.log('✅ Contraseña aceptada. P12 abierto.');
    
    const safeBags = p12.safeContents.map(c => c.safeBags).flat();
    console.log('   - Bolsas de seguridad encontradas:', safeBags.length);
    
    // Verificar certificados y llaves
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    console.log('   - Certificados X.509 encontrados:', certBags[forge.pki.oids.certBag] ? certBags[forge.pki.oids.certBag].length : 0);
    console.log('   - Claves privadas encontradas:', keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ? keyBags[forge.pki.oids.pkcs8ShroudedKeyBag].length : 0);
    
    console.log('\n5. Intentando firmar XML de prueba con osodreamer (CommonJS)...');
    
    // AQUÍ ESTÁ EL TRUCO: Usamos require() crudo para evitar el bug de Webpack
    const { signXml } = require('osodreamer-sri-xml-signer');
    
    const xml = '<factura><test>1</test></factura>';
    
    await signXml({
      p12Buffer: p12Buffer,
      password: data.password,
      xmlBuffer: Buffer.from(xml, 'utf8')
    });
    
    console.log('✅ ¡FIRMA COMPLETADA CON ÉXITO! El error sha1 ha desaparecido.');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ ERROR DURANTE LA PRUEBA AISLADA:');
    console.error(e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

runTest();
