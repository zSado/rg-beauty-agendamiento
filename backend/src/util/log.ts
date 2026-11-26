// Registro seguro (sección 7.3): nunca se registran contraseñas, tokens ni correos/teléfonos.
// Solo mensajes, códigos de referencia y datos técnicos no personales.
const CLAVES_PROHIBIDAS = /clave|password|token|secret|correo|email|telefono|cookie|authorization/i;

function limpiar(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) salida[k] = CLAVES_PROHIBIDAS.test(k) ? "[oculto]" : v;
  return salida;
}

function escribir(nivel: string, mensaje: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  const linea = { t: new Date().toISOString(), nivel, mensaje, ...limpiar(meta) };
  (nivel === "error" ? console.error : console.log)(JSON.stringify(linea));
}

export const log = {
  info: (m: string, meta?: Record<string, unknown>) => escribir("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => escribir("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => escribir("error", m, meta),
};
