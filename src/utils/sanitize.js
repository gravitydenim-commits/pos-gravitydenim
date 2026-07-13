/**
 * Sanea recursivamente cualquier objeto para que sea compatible con Firestore.
 * Reemplaza todos los valores 'undefined' por 'null' de forma profunda.
 */
export function sanitizeFirestorePayload(obj) {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeFirestorePayload(item));
  }
  if (typeof obj === 'object') {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        newObj[key] = sanitizeFirestorePayload(val);
      } else {
        newObj[key] = null;
      }
    }
    return newObj;
  }
  return obj;
}
