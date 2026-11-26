export const pesos = (n: number) => `$${n.toLocaleString("es-CL")}`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-11-17" -> "martes 17 de noviembre". Se arma a mano para no depender de la zona horaria. */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

export const soloFecha = (fh: string) => fh.slice(0, 10);
export const soloHora = (fh: string) => fh.slice(11, 16);

/** Fecha de hoy (AAAA-MM-DD) en hora de Chile. */
export function hoyChile(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date());
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const ESTADOS: Record<string, { texto: string; icono: string; clase: string }> = {
  PENDIENTE_PAGO: { texto: "Pendiente de pago", icono: "⏳", clase: "pendiente" },
  CONFIRMADA: { texto: "Confirmada", icono: "✔", clase: "ok" },
  CANCELADA: { texto: "Cancelada", icono: "✖", clase: "error" },
  EXPIRADA: { texto: "Expirada", icono: "⌛", clase: "neutro" },
  APROBADO: { texto: "Aprobado", icono: "✔", clase: "ok" },
  RECHAZADO: { texto: "Rechazado", icono: "✖", clase: "error" },
  REVERTIDO: { texto: "Revertido", icono: "↩", clase: "neutro" },
};
