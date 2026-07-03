import soap from 'soap';
import { generateXmlInvoice, signXml, authorizeXml, ENV_ENUM } from 'osodreamer-sri-xml-signer';

const WSDL_RECEPCION_PRUEBAS = 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl';
const WSDL_RECEPCION_PRODUCCION = 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl';

export async function enviarComprobanteSRI(xmlFirmadoBase64, ambiente = "1") {
  const wsdlUrl = ambiente === "1" ? WSDL_RECEPCION_PRUEBAS : WSDL_RECEPCION_PRODUCCION;
  
  return new Promise((resolve, reject) => {
    soap.createClient(wsdlUrl, (err, client) => {
      if (err) return reject(new Error('Error al conectar con SRI Recepción: ' + err.message));
      
      const args = {
        xml: xmlFirmadoBase64
      };
      
      client.validarComprobante(args, (err2, result) => {
        if (err2) return reject(err2);
        
        if (result && result.RespuestaRecepcionComprobante) {
          const estado = result.RespuestaRecepcionComprobante.estado;
          if (estado === 'RECIBIDA') {
            return resolve({ estado: 'RECIBIDA' });
          } else {
            const comprobantes = result.RespuestaRecepcionComprobante.comprobantes;
            const msjs = [];
            if (comprobantes && comprobantes.comprobante) {
              const comp = Array.isArray(comprobantes.comprobante) ? comprobantes.comprobante[0] : comprobantes.comprobante;
              if (comp.mensajes && comp.mensajes.mensaje) {
                const arr = Array.isArray(comp.mensajes.mensaje) ? comp.mensajes.mensaje : [comp.mensajes.mensaje];
                arr.forEach(m => msjs.push(m.mensaje + (m.informacionAdicional ? ' - ' + m.informacionAdicional : '')));
              }
            }
            return reject(new Error(`Factura DEVUELTA. ${msjs.join(' | ')}`));
          }
        }
        reject(new Error('Respuesta inválida del SRI (Recepción)'));
      });
    });
  });
}

export async function consultarAutorizacionSRI(claveAcceso, ambiente = "1") {
  const env = ambiente === "1" ? ENV_ENUM.PRUEBAS : ENV_ENUM.PRODUCCION;
  return await authorizeXml({ claveAcceso, env });
}
