const fs = require('fs');
const { generateRidePdf } = require('./src/lib/pdfGenerator');

async function testPdf() {
  const dummyIssuer = {
    name: "GRAVITY DENIM",
    ruc: "0991234567001",
    direccionMatriz: "Av. Principal 123 y Secundaria",
    contribuyenteEspecial: "135",
    obligadoContabilidad: true
  };

  const dummyCustomer = {
    nombre: "Juan Perez",
    numeroIdentificacion: "0912345678",
    direccion: "Calle Falsa 123",
    correo: "juan@example.com",
    telefono: "0991234567",
    tipoDocumento: "CEDULA"
  };

  const dummyCart = [
    { id: "J001", sku: "J-001", name: "Jean Classic Azul", qty: 2, price: 45.00 },
    { id: "C001", sku: "C-001", name: "Camiseta Básica Blanca", qty: 1, price: 15.00 }
  ];

  const dummyTotals = {
    subtotal: 105.00,
    baseImponible: 105.00,
    ivaAmount: 15.75,
    total: 120.75
  };

  const fecha = new Date();
  const claveAcceso = "1206202601099123456700110010010000001231234567819";

  console.log("Generando PDF de prueba...");
  try {
    const pdfBuffer = await generateRidePdf({
      issuerData: dummyIssuer,
      customer: dummyCustomer,
      cart: dummyCart,
      totalsData: dummyTotals,
      claveAcceso: claveAcceso,
      numeroComprobante: "001-001-000000123",
      fecha: fecha
    });

    fs.writeFileSync('RIDE_Prueba_Gravity_Denim.pdf', pdfBuffer);
    console.log("✅ PDF generado exitosamente: RIDE_Prueba_Gravity_Denim.pdf");
  } catch (err) {
    console.error("Error generando PDF:", err);
  }
}

testPdf();
