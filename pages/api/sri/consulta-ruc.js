import https from 'https';

/**
 * API oficial para consulta pública de contribuyentes en el Catastro del SRI
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { ruc, id } = req.query;
  const numId = (ruc || id || '').trim();

  if (!numId || (numId.length !== 10 && numId.length !== 13)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Identificación no válida', 
      message: 'No se encontraron datos públicos en el SRI. Ingrese el nombre manualmente' 
    });
  }

  // Si es 10 dígitos, transformar a RUC persona natural para consultar catastro oficial (RUC = Cédula + 001)
  const queryRuc = numId.length === 10 ? `${numId}001` : numId;

  try {
    // Consulta al Web Service de Catastro Oficial del SRI
    const urlSRI = `https://www.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumeroRuc?numeroRuc=${queryRuc}`;

    const sriResponse = await new Promise((resolve) => {
      const request = https.get(urlSRI, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          'Accept': 'application/json, text/plain, */*'
        },
        rejectUnauthorized: false,
        timeout: 4000
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          if (response.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              resolve({ success: true, data: json });
            } catch (e) {
              resolve({ success: false });
            }
          } else {
            resolve({ success: false });
          }
        });
      });

      request.on('error', () => resolve({ success: false }));
      request.on('timeout', () => {
        request.destroy();
        resolve({ success: false });
      });
    });

    if (sriResponse.success && sriResponse.data) {
      const item = sriResponse.data;
      const razonSocial = item.razonSocial || item.nombreComercial || '';
      const direccion = item.matriz?.direccionMatriz || item.direccionMatriz || item.direccion || '';

      if (razonSocial) {
        return res.status(200).json({
          success: true,
          razonSocial,
          nombreComercial: item.nombreComercial || razonSocial,
          direccion,
          origen: 'SRI_OFICIAL'
        });
      }
    }

    // Si el SRI no devuelve información o no existe en el catastro público
    return res.status(200).json({
      success: false,
      notFound: true,
      message: 'No se encontraron datos públicos en el SRI. Ingrese el nombre manualmente'
    });

  } catch (error) {
    console.error("Fallo controlado en consulta oficial SRI:", error.message);
    // Sin bloquear la facturación
    return res.status(200).json({
      success: false,
      error: error.message,
      message: 'No se encontraron datos públicos en el SRI. Ingrese el nombre manualmente'
    });
  }
}
