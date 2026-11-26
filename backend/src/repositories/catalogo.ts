import type { Consultable } from "../db/pg.js";

// Regla del equipo: toda consulta usa parámetros ($1, $2...). Prohibido concatenar texto en SQL.

export interface Servicio {
  id_servicio: number;
  nombre: string;
  precio: number;
  duracion_min: number;
  pct_abono: number;
}
export interface Profesional {
  id_profesional: number;
  nombre: string;
  especialidad: string;
}

export async function listarServicios(cx: Consultable): Promise<Servicio[]> {
  const r = await cx.query("SELECT id_servicio, nombre, precio, duracion_min, pct_abono FROM servicio ORDER BY nombre");
  return r.rows;
}

export async function obtenerServicio(cx: Consultable, id: number): Promise<Servicio | undefined> {
  const r = await cx.query(
    "SELECT id_servicio, nombre, precio, duracion_min, pct_abono FROM servicio WHERE id_servicio = $1",
    [id],
  );
  return r.rows[0];
}

export async function listarProfesionales(cx: Consultable, idServicio?: number): Promise<Profesional[]> {
  if (idServicio === undefined) {
    const r = await cx.query("SELECT id_profesional, nombre, especialidad FROM profesional ORDER BY nombre");
    return r.rows;
  }
  const r = await cx.query(
    `SELECT p.id_profesional, p.nombre, p.especialidad
       FROM profesional p
       JOIN profesional_servicio ps ON ps.id_profesional = p.id_profesional
      WHERE ps.id_servicio = $1
      ORDER BY p.nombre`,
    [idServicio],
  );
  return r.rows;
}

export async function obtenerProfesional(cx: Consultable, id: number): Promise<Profesional | undefined> {
  const r = await cx.query(
    "SELECT id_profesional, nombre, especialidad FROM profesional WHERE id_profesional = $1",
    [id],
  );
  return r.rows[0];
}

export async function profesionalRealizaServicio(
  cx: Consultable,
  idProfesional: number,
  idServicio: number,
): Promise<boolean> {
  const r = await cx.query(
    "SELECT 1 FROM profesional_servicio WHERE id_profesional = $1 AND id_servicio = $2",
    [idProfesional, idServicio],
  );
  return r.rowCount === 1;
}

export interface Ventana {
  desde: string; // HH:MM
  hasta: string;
}

export async function ventanasDelDia(cx: Consultable, idProfesional: number, dia: number): Promise<Ventana[]> {
  const r = await cx.query(
    `SELECT to_char(hora_inicio, 'HH24:MI') AS desde, to_char(hora_fin, 'HH24:MI') AS hasta
       FROM disponibilidad
      WHERE id_profesional = $1 AND dia_semana = $2
      ORDER BY hora_inicio`,
    [idProfesional, dia],
  );
  return r.rows;
}

export async function ventanasSemanales(cx: Consultable) {
  const r = await cx.query(
    `SELECT id_profesional, dia_semana,
            to_char(hora_inicio, 'HH24:MI') AS desde, to_char(hora_fin, 'HH24:MI') AS hasta
       FROM disponibilidad`,
  );
  return r.rows as { id_profesional: number; dia_semana: number; desde: string; hasta: string }[];
}

export interface Bloqueo {
  id_bloqueo: number;
  id_profesional: number;
  inicio: string;
  fin: string;
  motivo: string | null;
}

export async function bloqueosEnRango(
  cx: Consultable,
  idProfesional: number,
  desde: string,
  hasta: string,
): Promise<Bloqueo[]> {
  const r = await cx.query(
    `SELECT id_bloqueo, id_profesional, inicio, fin, motivo
       FROM bloqueo
      WHERE id_profesional = $1 AND inicio < $3 AND fin > $2
      ORDER BY inicio`,
    [idProfesional, desde, hasta],
  );
  return r.rows;
}

export async function crearBloqueo(
  cx: Consultable,
  b: { id_profesional: number; inicio: string; fin: string; motivo?: string },
): Promise<Bloqueo> {
  const r = await cx.query(
    `INSERT INTO bloqueo (id_profesional, inicio, fin, motivo) VALUES ($1, $2, $3, $4)
     RETURNING id_bloqueo, id_profesional, inicio, fin, motivo`,
    [b.id_profesional, b.inicio, b.fin, b.motivo ?? null],
  );
  return r.rows[0];
}

export async function listarBloqueosFuturos(cx: Consultable, idProfesional?: number): Promise<Bloqueo[]> {
  const r = await cx.query(
    `SELECT id_bloqueo, id_profesional, inicio, fin, motivo
       FROM bloqueo
      WHERE fin > (now() AT TIME ZONE 'America/Santiago')
        AND ($1::int IS NULL OR id_profesional = $1)
      ORDER BY inicio`,
    [idProfesional ?? null],
  );
  return r.rows;
}

export async function obtenerBloqueo(cx: Consultable, id: number): Promise<Bloqueo | undefined> {
  const r = await cx.query(
    "SELECT id_bloqueo, id_profesional, inicio, fin, motivo FROM bloqueo WHERE id_bloqueo = $1",
    [id],
  );
  return r.rows[0];
}

export async function eliminarBloqueo(cx: Consultable, id: number): Promise<void> {
  await cx.query("DELETE FROM bloqueo WHERE id_bloqueo = $1", [id]);
}

// ---------------- Administración del catálogo (CRUD de servicios y profesionales) ----------------

export interface DatosServicio {
  nombre: string;
  precio: number;
  duracion_min: number;
  pct_abono: number;
}

export async function crearServicio(cx: Consultable, d: DatosServicio): Promise<Servicio> {
  const r = await cx.query(
    `INSERT INTO servicio (nombre, precio, duracion_min, pct_abono) VALUES ($1,$2,$3,$4)
     RETURNING id_servicio, nombre, precio, duracion_min, pct_abono`,
    [d.nombre, d.precio, d.duracion_min, d.pct_abono],
  );
  return r.rows[0];
}

export async function actualizarServicio(cx: Consultable, id: number, d: DatosServicio): Promise<Servicio | undefined> {
  const r = await cx.query(
    `UPDATE servicio SET nombre=$2, precio=$3, duracion_min=$4, pct_abono=$5 WHERE id_servicio=$1
     RETURNING id_servicio, nombre, precio, duracion_min, pct_abono`,
    [id, d.nombre, d.precio, d.duracion_min, d.pct_abono],
  );
  return r.rows[0];
}

export async function contarCitasDeServicio(cx: Consultable, id: number): Promise<number> {
  const r = await cx.query("SELECT count(*)::int AS n FROM cita WHERE id_servicio = $1", [id]);
  return r.rows[0].n;
}

export async function eliminarServicio(cx: Consultable, id: number): Promise<boolean> {
  await cx.query("DELETE FROM profesional_servicio WHERE id_servicio = $1", [id]);
  const r = await cx.query("DELETE FROM servicio WHERE id_servicio = $1", [id]);
  return r.rowCount === 1;
}

export interface ProfesionalConServicios extends Profesional {
  servicios: number[];
}

export async function listarProfesionalesConServicios(cx: Consultable): Promise<ProfesionalConServicios[]> {
  const r = await cx.query(
    `SELECT p.id_profesional, p.nombre, p.especialidad,
            COALESCE(array_agg(ps.id_servicio ORDER BY ps.id_servicio) FILTER (WHERE ps.id_servicio IS NOT NULL), '{}') AS servicios
       FROM profesional p LEFT JOIN profesional_servicio ps ON ps.id_profesional = p.id_profesional
      GROUP BY p.id_profesional ORDER BY p.nombre`,
  );
  return r.rows;
}

export async function crearProfesional(cx: Consultable, d: { nombre: string; especialidad: string }): Promise<number> {
  const r = await cx.query(
    "INSERT INTO profesional (nombre, especialidad) VALUES ($1,$2) RETURNING id_profesional",
    [d.nombre, d.especialidad],
  );
  return r.rows[0].id_profesional;
}

export async function actualizarProfesional(
  cx: Consultable,
  id: number,
  d: { nombre: string; especialidad: string },
): Promise<boolean> {
  const r = await cx.query("UPDATE profesional SET nombre=$2, especialidad=$3 WHERE id_profesional=$1", [id, d.nombre, d.especialidad]);
  return r.rowCount === 1;
}

/** Reemplaza la lista de servicios que realiza un profesional (las claves foráneas validan que existan). */
export async function reemplazarServiciosDeProfesional(cx: Consultable, id: number, servicios: number[]) {
  await cx.query("DELETE FROM profesional_servicio WHERE id_profesional = $1", [id]);
  for (const s of new Set(servicios)) {
    await cx.query("INSERT INTO profesional_servicio (id_profesional, id_servicio) VALUES ($1,$2)", [id, s]);
  }
}

export async function contarCitasDeProfesional(cx: Consultable, id: number): Promise<number> {
  const r = await cx.query("SELECT count(*)::int AS n FROM cita WHERE id_profesional = $1", [id]);
  return r.rows[0].n;
}

export async function contarUsuariosDeProfesional(cx: Consultable, id: number): Promise<number> {
  const r = await cx.query("SELECT count(*)::int AS n FROM usuario WHERE id_profesional = $1", [id]);
  return r.rows[0].n;
}

export async function eliminarProfesional(cx: Consultable, id: number): Promise<boolean> {
  await cx.query("DELETE FROM profesional_servicio WHERE id_profesional = $1", [id]);
  await cx.query("DELETE FROM disponibilidad WHERE id_profesional = $1", [id]);
  await cx.query("DELETE FROM bloqueo WHERE id_profesional = $1", [id]);
  const r = await cx.query("DELETE FROM profesional WHERE id_profesional = $1", [id]);
  return r.rowCount === 1;
}

export interface VentanaSemanal extends Ventana {
  dia_semana: number;
}

export async function ventanasDeProfesional(cx: Consultable, id: number): Promise<VentanaSemanal[]> {
  const r = await cx.query(
    `SELECT dia_semana, to_char(hora_inicio,'HH24:MI') AS desde, to_char(hora_fin,'HH24:MI') AS hasta
       FROM disponibilidad WHERE id_profesional = $1 ORDER BY dia_semana, hora_inicio`,
    [id],
  );
  return r.rows;
}

export async function reemplazarVentanas(cx: Consultable, id: number, ventanas: VentanaSemanal[]) {
  await cx.query("DELETE FROM disponibilidad WHERE id_profesional = $1", [id]);
  for (const v of ventanas) {
    await cx.query(
      "INSERT INTO disponibilidad (id_profesional, dia_semana, hora_inicio, hora_fin) VALUES ($1,$2,$3,$4)",
      [id, v.dia_semana, v.desde, v.hasta],
    );
  }
}

export async function actualizarBloqueo(
  cx: Consultable,
  id: number,
  b: { inicio: string; fin: string; motivo: string | null },
): Promise<Bloqueo | undefined> {
  const r = await cx.query(
    `UPDATE bloqueo SET inicio=$2, fin=$3, motivo=$4 WHERE id_bloqueo=$1
     RETURNING id_bloqueo, id_profesional, inicio, fin, motivo`,
    [id, b.inicio, b.fin, b.motivo],
  );
  return r.rows[0];
}
