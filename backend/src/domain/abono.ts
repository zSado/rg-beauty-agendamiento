/**
 * RN-01: el abono es un porcentaje del precio, calculado siempre en el servidor y en pesos enteros.
 * Redondeo al peso más cercano (mitad hacia arriba), con aritmética entera para no depender del
 * punto flotante. Ejemplo: 33.333 al 20 % = 6.666,6 -> 6.667.
 */
export function calcularAbono(precio: number, pctAbono: number): number {
  if (!Number.isInteger(precio) || precio <= 0) {
    throw new RangeError("El precio debe ser un entero mayor que 0");
  }
  if (!Number.isInteger(pctAbono) || pctAbono < 0 || pctAbono > 100) {
    throw new RangeError("El porcentaje de abono debe estar entre 0 y 100");
  }
  return Math.floor((precio * pctAbono + 50) / 100);
}
