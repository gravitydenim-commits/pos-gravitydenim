export const validarCedula = (cedula) => {
  if (!cedula || cedula.length !== 10) return false;
  if (cedula === '9999999999') return true; // Consumidor final

  const provincia = parseInt(cedula.substring(0, 2), 10);
  if (provincia < 1 || provincia > 24) return false;

  const tercerDigito = parseInt(cedula.substring(2, 3), 10);
  if (tercerDigito >= 6) return false;

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;

  for (let i = 0; i < 9; i++) {
    let valor = parseInt(cedula.substring(i, i + 1), 10) * coeficientes[i];
    if (valor > 9) valor -= 9;
    suma += valor;
  }

  let digitoVerificadorEsperado = 10 - (suma % 10);
  if (digitoVerificadorEsperado === 10) {
    digitoVerificadorEsperado = 0;
  }
  const digitoVerificadorReal = parseInt(cedula.substring(9, 10), 10);

  return digitoVerificadorEsperado === digitoVerificadorReal;
};

export const validarRUC = (ruc) => {
  if (!ruc || ruc.length !== 13) return false;
  if (ruc === '9999999999999') return true; // Consumidor final

  const provincia = parseInt(ruc.substring(0, 2), 10);
  if (provincia < 1 || provincia > 24) return false;

  const tercerDigito = parseInt(ruc.substring(2, 3), 10);
  
  if (tercerDigito < 6) {
    // RUC Persona Natural (termina en 001 y los primeros 10 dígitos son una cédula válida)
    const cedula = ruc.substring(0, 10);
    const ultimosTres = ruc.substring(10, 13);
    if (ultimosTres !== '001') return false;
    return validarCedula(cedula);
  } else if (tercerDigito === 6) {
    // RUC Sociedad Pública
    const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 8; i++) {
      suma += parseInt(ruc.substring(i, i + 1), 10) * coeficientes[i];
    }
    const residuo = suma % 11;
    const digitoVerificadorEsperado = residuo === 0 ? 0 : 11 - residuo;
    const digitoVerificadorReal = parseInt(ruc.substring(8, 9), 10);
    const ultimosCuatro = ruc.substring(9, 13);
    return digitoVerificadorEsperado === digitoVerificadorReal && ultimosCuatro === '0001';
  } else if (tercerDigito === 9) {
    // RUC Sociedad Privada o Extranjero
    const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      suma += parseInt(ruc.substring(i, i + 1), 10) * coeficientes[i];
    }
    const residuo = suma % 11;
    const digitoVerificadorEsperado = residuo === 0 ? 0 : 11 - residuo;
    const digitoVerificadorReal = parseInt(ruc.substring(9, 10), 10);
    const ultimosTres = ruc.substring(10, 13);
    return digitoVerificadorEsperado === digitoVerificadorReal && ultimosTres === '001';
  }
  
  return false;
};
