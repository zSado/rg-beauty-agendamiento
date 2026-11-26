import { minutosEntre, sumarMinutos } from "../util/fechas.js";

export interface Intervalo {
  inicio: string; // AAAA-MM-DDTHH:MM
  fin: string;
}

export const PASO_MINUTOS = 30;

export function seTraslapan(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && a.fin > b.inicio;
}

/**
 * Horas de inicio posibles de un servicio dentro de una ventana de atención,
 * cada PASO_MINUTOS, que caben completas, que no se traslapan con ocupados y no son pasadas.
 */
export function horasLibres(opts: {
  fecha: string;
  ventanas: { desde: string; hasta: string }[]; // HH:MM
  duracionMin: number;
  ocupados: Intervalo[];
  ahoraLocal: string; // AAAA-MM-DDTHH:MM
}): string[] {
  const libres: string[] = [];
  for (const v of opts.ventanas) {
    const ini = `${opts.fecha}T${v.desde}`;
    const fin = `${opts.fecha}T${v.hasta}`;
    for (let t = ini; ; t = sumarMinutos(t, PASO_MINUTOS)) {
      const termina = sumarMinutos(t, opts.duracionMin);
      if (termina > fin) break;
      if (t <= opts.ahoraLocal) continue;
      if (opts.ocupados.some((o) => seTraslapan({ inicio: t, fin: termina }, o))) continue;
      libres.push(t.slice(11, 16));
    }
  }
  return [...new Set(libres)].sort();
}

/** Tiempo muerto: suma de huecos entre citas consecutivas del mismo día de un profesional. */
export function tiempoMuertoMin(citas: Intervalo[]): number {
  const orden = [...citas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  let total = 0;
  for (let i = 1; i < orden.length; i++) {
    const anterior = orden[i - 1]!;
    const actual = orden[i]!;
    if (actual.inicio > anterior.fin) total += minutosEntre(anterior.fin, actual.inicio);
  }
  return total;
}
