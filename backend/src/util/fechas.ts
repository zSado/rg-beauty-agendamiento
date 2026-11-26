// Las fechas del módulo son hora local de Chile, sin zona: "AAAA-MM-DDTHH:MM".
// Se manipulan como texto/UTC solo para sumar minutos y no depender de la zona del servidor.

export const FORMATO_FECHA_HORA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;
export const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function aUtc(texto: string): Date {
  const t = texto.replace(" ", "T");
  return new Date(`${t}:00Z`);
}

function aTexto(d: Date): string {
  return d.toISOString().slice(0, 16); // AAAA-MM-DDTHH:MM
}

export function normalizar(texto: string): string {
  return aTexto(aUtc(texto));
}

export function sumarMinutos(texto: string, minutos: number): string {
  return aTexto(new Date(aUtc(texto).getTime() + minutos * 60_000));
}

export function minutosEntre(inicio: string, fin: string): number {
  return Math.round((aUtc(fin).getTime() - aUtc(inicio).getTime()) / 60_000);
}

export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function esFechaValida(fecha: string): boolean {
  if (!FORMATO_FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

export function esFechaHoraValida(texto: string): boolean {
  if (!FORMATO_FECHA_HORA.test(texto)) return false;
  const d = aUtc(texto);
  return !Number.isNaN(d.getTime()) && aTexto(d) === texto.replace(" ", "T");
}
