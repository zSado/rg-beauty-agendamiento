import { tiempoMuertoMin } from "../domain/horarios.js";
import { getPool } from "../db/pg.js";
import * as catalogo from "../repositories/catalogo.js";
import * as citas from "../repositories/citas.js";
import { ErrorNegocio } from "../util/errores.js";
import { diaSemana, esFechaValida, minutosEntre, sumarDias } from "../util/fechas.js";

export interface Indicadores {
  desde: string;
  hasta: string;
  ocupacion_pct: number; // horas atendidas / horas disponibles
  cancelacion_pct: number; // canceladas / agendadas
  tiempo_muerto_min: number; // huecos entre citas dentro de cada jornada
  traslapes: number; // debe ser 0
  citas_confirmadas: number;
  citas_canceladas: number;
}

const redondear = (n: number) => Math.round(n * 10) / 10;

/**
 * HU-07. Definiciones (Unidad II):
 *  - Ocupación: minutos de citas CONFIRMADAS / minutos de atención publicados en el horario semanal.
 *  - Cancelación: CANCELADAS / (CONFIRMADAS + CANCELADAS). Las PENDIENTE_PAGO y EXPIRADA no
 *    cuentan como "agendadas" porque nunca llegaron a confirmarse.
 *  - Tiempo muerto: suma de huecos entre citas confirmadas consecutivas del mismo profesional y día.
 */
export async function indicadores(desde: string, hasta: string): Promise<Indicadores> {
  if (!esFechaValida(desde) || !esFechaValida(hasta) || hasta < desde) {
    throw new ErrorNegocio("RANGO_INVALIDO", "El rango de fechas no es válido.", 422);
  }
  if (minutosEntre(`${desde}T00:00`, `${hasta}T00:00`) > 366 * 24 * 60) {
    throw new ErrorNegocio("RANGO_INVALIDO", "El rango máximo es de un año.", 422);
  }
  const cx = getPool();
  const [ventanas, lista, traslapes] = await Promise.all([
    catalogo.ventanasSemanales(cx),
    citas.citasEnRango(cx, desde, hasta),
    citas.contarTraslapes(cx),
  ]);

  let disponibles = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const dow = diaSemana(f);
    for (const v of ventanas) {
      if (v.dia_semana === dow) disponibles += minutosEntre(`${f}T${v.desde}`, `${f}T${v.hasta}`);
    }
  }

  const confirmadas = lista.filter((c) => c.estado === "CONFIRMADA");
  const canceladas = lista.filter((c) => c.estado === "CANCELADA");
  const atendidos = confirmadas.reduce((s, c) => s + minutosEntre(c.fecha_hora, c.fecha_hora_fin), 0);

  const porJornada = new Map<string, { inicio: string; fin: string }[]>();
  for (const c of confirmadas) {
    const k = `${c.id_profesional}|${c.fecha_hora.slice(0, 10)}`;
    (porJornada.get(k) ?? porJornada.set(k, []).get(k)!).push({ inicio: c.fecha_hora, fin: c.fecha_hora_fin });
  }
  let muerto = 0;
  for (const grupo of porJornada.values()) muerto += tiempoMuertoMin(grupo);

  const agendadas = confirmadas.length + canceladas.length;
  return {
    desde,
    hasta,
    ocupacion_pct: disponibles > 0 ? redondear((atendidos / disponibles) * 100) : 0,
    cancelacion_pct: agendadas > 0 ? redondear((canceladas.length / agendadas) * 100) : 0,
    tiempo_muerto_min: muerto,
    traslapes,
    citas_confirmadas: confirmadas.length,
    citas_canceladas: canceladas.length,
  };
}
