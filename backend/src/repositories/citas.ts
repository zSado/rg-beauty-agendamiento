import type { Consultable } from "../db/pg.js";
import { AHORA_LOCAL_SQL } from "../db/pg.js";

export type EstadoCita = "PENDIENTE_PAGO" | "CONFIRMADA" | "CANCELADA" | "EXPIRADA";

export interface Cita {
  id_cita: number;
  id_cliente: number;
  id_servicio: number;
  id_profesional: number;
  fecha_hora: string; // AAAA-MM-DDTHH:MM
  fecha_hora_fin: string;
  estado: EstadoCita;
  monto_abono: number;
  expira_en: string | null; // AAAA-MM-DDTHH:MM:SS
  /** Segundos que quedan de la retención de 15 minutos (solo PENDIENTE_PAGO). Lo calcula la base de datos. */
  segundos_restantes: number | null;
}

const COLUMNAS = `c.id_cita, c.id_cliente, c.id_servicio, c.id_profesional,
  c.fecha_hora, c.fecha_hora_fin, c.estado, c.monto_abono, c.expira_en,
  CASE WHEN c.estado = 'PENDIENTE_PAGO'
       THEN GREATEST(0, EXTRACT(EPOCH FROM (c.expira_en - ${AHORA_LOCAL_SQL}))::int) END AS segundos_restantes`;

function mapear(row: Cita): Cita {
  return { ...row, fecha_hora: row.fecha_hora.slice(0, 16), fecha_hora_fin: row.fecha_hora_fin.slice(0, 16) };
}

/** Serializa las reservas del mismo profesional: dos solicitudes simultáneas se ponen en fila. */
export async function bloquearProfesional(cx: Consultable, idProfesional: number): Promise<boolean> {
  const r = await cx.query("SELECT 1 FROM profesional WHERE id_profesional = $1 FOR UPDATE", [idProfesional]);
  return r.rowCount === 1;
}

/** RN-04: las citas sin pago pasan a EXPIRADA y liberan el horario. */
export async function expirarVencidas(cx: Consultable, idProfesional?: number): Promise<number> {
  const r = await cx.query(
    `UPDATE cita SET estado = 'EXPIRADA'
      WHERE estado = 'PENDIENTE_PAGO' AND expira_en <= ${AHORA_LOCAL_SQL}
        AND ($1::int IS NULL OR id_profesional = $1)`,
    [idProfesional ?? null],
  );
  return r.rowCount ?? 0;
}

export async function hayTraslape(
  cx: Consultable,
  idProfesional: number,
  inicio: string,
  fin: string,
  excluirIdCita?: number,
): Promise<boolean> {
  const r = await cx.query(
    `SELECT 1 FROM cita
      WHERE id_profesional = $1 AND estado IN ('PENDIENTE_PAGO','CONFIRMADA')
        AND fecha_hora < $3 AND fecha_hora_fin > $2
        AND ($4::int IS NULL OR id_cita <> $4)
      LIMIT 1`,
    [idProfesional, inicio, fin, excluirIdCita ?? null],
  );
  return r.rowCount === 1;
}

export async function insertarCita(
  cx: Consultable,
  c: {
    id_cliente: number;
    id_servicio: number;
    id_profesional: number;
    inicio: string;
    fin: string;
    monto_abono: number;
    retencion_min: number;
  },
): Promise<Cita> {
  const r = await cx.query(
    `INSERT INTO cita (id_cliente, id_servicio, id_profesional, fecha_hora, fecha_hora_fin,
                       estado, monto_abono, expira_en)
     VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_PAGO', $6,
             ${AHORA_LOCAL_SQL} + make_interval(mins => $7))
     RETURNING id_cita, id_cliente, id_servicio, id_profesional, fecha_hora, fecha_hora_fin,
               estado, monto_abono, expira_en,
               GREATEST(0, EXTRACT(EPOCH FROM (expira_en - ${AHORA_LOCAL_SQL}))::int) AS segundos_restantes`,
    [c.id_cliente, c.id_servicio, c.id_profesional, c.inicio, c.fin, c.monto_abono, c.retencion_min],
  );
  return mapear(r.rows[0]);
}

export async function obtenerCita(cx: Consultable, id: number, bloquear = false): Promise<Cita | undefined> {
  const r = await cx.query(
    `SELECT ${COLUMNAS} FROM cita c WHERE c.id_cita = $1 ${bloquear ? "FOR UPDATE" : ""}`,
    [id],
  );
  return r.rows[0] ? mapear(r.rows[0]) : undefined;
}

export async function cambiarEstado(cx: Consultable, id: number, estado: EstadoCita): Promise<void> {
  await cx.query("UPDATE cita SET estado = $2 WHERE id_cita = $1", [id, estado]);
}

/** Intervalos ocupados (citas activas) de un profesional en un día. */
export async function ocupadosDelDia(cx: Consultable, idProfesional: number, fecha: string) {
  const r = await cx.query(
    `SELECT fecha_hora AS inicio, fecha_hora_fin AS fin FROM cita
      WHERE id_profesional = $1 AND estado IN ('PENDIENTE_PAGO','CONFIRMADA')
        AND fecha_hora < ($2::date + 1) AND fecha_hora_fin > $2::date`,
    [idProfesional, fecha],
  );
  return (r.rows as { inicio: string; fin: string }[]).map((x) => ({
    inicio: x.inicio.slice(0, 16),
    fin: x.fin.slice(0, 16),
  }));
}

export interface CitaDetalle extends Cita {
  servicio: string;
  profesional: string;
  cliente: string;
  precio: number;
  pagado: number;
}

const DETALLE = `
  SELECT ${COLUMNAS}, s.nombre AS servicio, s.precio, p.nombre AS profesional, cl.nombre AS cliente,
         COALESCE((SELECT SUM(pg.monto) FROM pago pg WHERE pg.id_cita = c.id_cita AND pg.estado = 'APROBADO'), 0)::int AS pagado
    FROM cita c
    JOIN servicio s ON s.id_servicio = c.id_servicio
    JOIN profesional p ON p.id_profesional = c.id_profesional
    JOIN cliente cl ON cl.id_cliente = c.id_cliente`;

function mapearDetalle(row: CitaDetalle): CitaDetalle {
  return { ...row, fecha_hora: row.fecha_hora.slice(0, 16), fecha_hora_fin: row.fecha_hora_fin.slice(0, 16) };
}

export async function detalleDeCita(cx: Consultable, id: number): Promise<CitaDetalle | undefined> {
  const r = await cx.query(`${DETALLE} WHERE c.id_cita = $1`, [id]);
  return r.rows[0] ? mapearDetalle(r.rows[0]) : undefined;
}

export async function citasDeCliente(cx: Consultable, idCliente: number): Promise<CitaDetalle[]> {
  const r = await cx.query(`${DETALLE} WHERE c.id_cliente = $1 ORDER BY c.fecha_hora DESC`, [idCliente]);
  return r.rows.map(mapearDetalle);
}

/** Agenda de un día. Si se indica idProfesional, solo las citas de ese profesional. */
export async function agendaDelDia(cx: Consultable, fecha: string, idProfesional?: number) {
  const r = await cx.query(
    `${DETALLE}
      WHERE c.fecha_hora >= $1::date AND c.fecha_hora < ($1::date + 1)
        AND c.estado <> 'EXPIRADA'
        AND ($2::int IS NULL OR c.id_profesional = $2)
      ORDER BY c.fecha_hora`,
    [fecha, idProfesional ?? null],
  );
  return r.rows.map(mapearDetalle);
}

export async function citasEnRango(cx: Consultable, desde: string, hasta: string) {
  const r = await cx.query(
    `SELECT c.id_cita, c.id_profesional, c.estado, c.fecha_hora, c.fecha_hora_fin
       FROM cita c
      WHERE c.fecha_hora >= $1::date AND c.fecha_hora < ($2::date + 1)`,
    [desde, hasta],
  );
  return (r.rows as { id_cita: number; id_profesional: number; estado: EstadoCita; fecha_hora: string; fecha_hora_fin: string }[]).map(
    (x) => ({ ...x, fecha_hora: x.fecha_hora.slice(0, 16), fecha_hora_fin: x.fecha_hora_fin.slice(0, 16) }),
  );
}

/** Cantidad de pares de citas activas del mismo profesional que se traslapan (debe ser 0). */
export async function contarTraslapes(cx: Consultable): Promise<number> {
  const r = await cx.query(
    `SELECT count(*)::int AS n
       FROM cita a JOIN cita b
         ON a.id_profesional = b.id_profesional AND a.id_cita < b.id_cita
        AND a.fecha_hora < b.fecha_hora_fin AND a.fecha_hora_fin > b.fecha_hora
      WHERE a.estado IN ('PENDIENTE_PAGO','CONFIRMADA') AND b.estado IN ('PENDIENTE_PAGO','CONFIRMADA')`,
  );
  return r.rows[0].n;
}

export async function citasActivasEnIntervalo(cx: Consultable, idProfesional: number, inicio: string, fin: string) {
  const r = await cx.query(
    `SELECT count(*)::int AS n FROM cita
      WHERE id_profesional = $1 AND estado IN ('PENDIENTE_PAGO','CONFIRMADA')
        AND fecha_hora < $3 AND fecha_hora_fin > $2`,
    [idProfesional, inicio, fin],
  );
  return r.rows[0].n as number;
}

/** UPDATE: mueve una cita a otro horario (mismo servicio y mismo abono). */
export async function actualizarHorario(cx: Consultable, id: number, inicio: string, fin: string): Promise<void> {
  await cx.query("UPDATE cita SET fecha_hora = $2, fecha_hora_fin = $3 WHERE id_cita = $1", [id, inicio, fin]);
}

export async function contarPagosPorEstado(cx: Consultable, idCita: number) {
  const r = await cx.query("SELECT estado, count(*)::int AS n FROM pago WHERE id_cita = $1 GROUP BY estado", [idCita]);
  return Object.fromEntries((r.rows as { estado: string; n: number }[]).map((x) => [x.estado, x.n])) as Record<string, number>;
}

/** DELETE: elimina una cita (y sus intentos de pago rechazados). */
export async function eliminarCita(cx: Consultable, id: number): Promise<boolean> {
  await cx.query("DELETE FROM pago WHERE id_cita = $1 AND estado = 'RECHAZADO'", [id]);
  const r = await cx.query("DELETE FROM cita WHERE id_cita = $1", [id]);
  return r.rowCount === 1;
}

export interface FiltroReporte {
  desde: string;
  hasta: string;
  estado?: EstadoCita;
  idProfesional?: number;
  idServicio?: number;
}

/** Reporte: citas cuya fecha cae en el rango, con filtros opcionales. Consulta la base en cada llamada. */
export async function reporteCitas(cx: Consultable, f: FiltroReporte, limite = 1000): Promise<CitaDetalle[]> {
  const r = await cx.query(
    `${DETALLE}
      WHERE c.fecha_hora >= $1::date AND c.fecha_hora < ($2::date + 1)
        AND ($3::text IS NULL OR c.estado = $3)
        AND ($4::int IS NULL OR c.id_profesional = $4)
        AND ($5::int IS NULL OR c.id_servicio = $5)
      ORDER BY c.fecha_hora, c.id_cita
      LIMIT $6`,
    [f.desde, f.hasta, f.estado ?? null, f.idProfesional ?? null, f.idServicio ?? null, limite],
  );
  return r.rows.map(mapearDetalle);
}
