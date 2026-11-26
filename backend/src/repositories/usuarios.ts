import type { Consultable } from "../db/pg.js";

export type Rol = "CLIENTA" | "PROFESIONAL" | "ADMIN";

export interface Usuario {
  id_usuario: number;
  correo: string;
  clave_hash: string;
  rol: Rol;
  id_cliente: number | null;
  id_profesional: number | null;
  autorizado_pagos: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
}

const COLS = `id_usuario, correo, clave_hash, rol, id_cliente, id_profesional,
  autorizado_pagos, intentos_fallidos, bloqueado_hasta`;

export async function crearCliente(
  cx: Consultable,
  c: { nombre: string; correo: string; telefono: string },
): Promise<number> {
  const r = await cx.query(
    "INSERT INTO cliente (nombre, correo, telefono) VALUES ($1, $2, $3) RETURNING id_cliente",
    [c.nombre, c.correo, c.telefono],
  );
  return r.rows[0].id_cliente;
}

export async function obtenerClientePorCorreo(cx: Consultable, correo: string) {
  const r = await cx.query("SELECT id_cliente, nombre, correo, telefono FROM cliente WHERE correo = $1", [correo]);
  return r.rows[0] as { id_cliente: number; nombre: string; correo: string; telefono: string } | undefined;
}

export async function obtenerCliente(cx: Consultable, id: number) {
  const r = await cx.query("SELECT id_cliente, nombre, correo, telefono FROM cliente WHERE id_cliente = $1", [id]);
  return r.rows[0] as { id_cliente: number; nombre: string; correo: string; telefono: string } | undefined;
}

export async function crearUsuario(
  cx: Consultable,
  u: {
    correo: string;
    clave_hash: string;
    rol: Rol;
    id_cliente?: number;
    id_profesional?: number;
    autorizado_pagos?: boolean;
  },
): Promise<number> {
  const r = await cx.query(
    `INSERT INTO usuario (correo, clave_hash, rol, id_cliente, id_profesional, autorizado_pagos)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_usuario`,
    [u.correo, u.clave_hash, u.rol, u.id_cliente ?? null, u.id_profesional ?? null, u.autorizado_pagos ?? false],
  );
  return r.rows[0].id_usuario;
}

export async function obtenerUsuarioPorCorreo(cx: Consultable, correo: string): Promise<Usuario | undefined> {
  const r = await cx.query(`SELECT ${COLS} FROM usuario WHERE correo = $1`, [correo]);
  return r.rows[0];
}

export async function obtenerUsuario(cx: Consultable, id: number): Promise<Usuario | undefined> {
  const r = await cx.query(`SELECT ${COLS} FROM usuario WHERE id_usuario = $1`, [id]);
  return r.rows[0];
}

/** Suma un intento fallido; al llegar al máximo bloquea la cuenta por los minutos indicados. */
export async function registrarFallo(cx: Consultable, id: number, maximo: number, bloqueoMin: number) {
  await cx.query(
    `UPDATE usuario
        SET intentos_fallidos = intentos_fallidos + 1,
            bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2
                                   THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
      WHERE id_usuario = $1`,
    [id, maximo, bloqueoMin],
  );
}

export async function limpiarFallos(cx: Consultable, id: number) {
  await cx.query("UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1", [id]);
}

export async function crearSesion(cx: Consultable, idUsuario: number, tokenHash: string, dias: number) {
  await cx.query(
    "INSERT INTO sesion (id_usuario, token_hash, expira_en) VALUES ($1, $2, now() + make_interval(days => $3))",
    [idUsuario, tokenHash, dias],
  );
}

/** Rotación: marca la sesión como usada y devuelve el usuario si estaba vigente. */
export async function consumirSesion(cx: Consultable, tokenHash: string): Promise<number | undefined> {
  const r = await cx.query(
    `UPDATE sesion SET revocada = TRUE
      WHERE token_hash = $1 AND revocada = FALSE AND expira_en > now()
      RETURNING id_usuario`,
    [tokenHash],
  );
  return r.rows[0]?.id_usuario;
}

export async function revocarSesion(cx: Consultable, tokenHash: string) {
  await cx.query("UPDATE sesion SET revocada = TRUE WHERE token_hash = $1", [tokenHash]);
}

export async function registrarAuditoria(
  cx: Consultable,
  idUsuario: number | null,
  accion: string,
  detalle?: string,
) {
  await cx.query("INSERT INTO auditoria (id_usuario, accion, detalle) VALUES ($1, $2, $3)", [
    idUsuario,
    accion,
    detalle ?? null,
  ]);
}

export async function listarAuditoria(cx: Consultable, limite = 100) {
  const r = await cx.query(
    "SELECT id_auditoria, id_usuario, accion, detalle, creado_en FROM auditoria ORDER BY id_auditoria DESC LIMIT $1",
    [limite],
  );
  return r.rows as { id_auditoria: number; id_usuario: number | null; accion: string; detalle: string | null; creado_en: Date }[];
}

export async function actualizarCliente(cx: Consultable, id: number, d: { nombre: string; telefono: string }) {
  const r = await cx.query(
    "UPDATE cliente SET nombre=$2, telefono=$3 WHERE id_cliente=$1 RETURNING id_cliente, nombre, correo, telefono",
    [id, d.nombre, d.telefono],
  );
  return r.rows[0] as { id_cliente: number; nombre: string; correo: string; telefono: string } | undefined;
}

export async function contarCitasDeCliente(cx: Consultable, id: number): Promise<number> {
  const r = await cx.query("SELECT count(*)::int AS n FROM cita WHERE id_cliente = $1", [id]);
  return r.rows[0].n;
}

/** Elimina la cuenta de una clienta (sesiones, usuario y ficha). Solo si nunca tuvo citas. */
export async function eliminarClienta(cx: Consultable, idUsuario: number, idCliente: number) {
  await cx.query("DELETE FROM sesion WHERE id_usuario = $1", [idUsuario]);
  await cx.query("UPDATE auditoria SET id_usuario = NULL WHERE id_usuario = $1", [idUsuario]);
  await cx.query("DELETE FROM usuario WHERE id_usuario = $1", [idUsuario]);
  await cx.query("DELETE FROM cliente WHERE id_cliente = $1", [idCliente]);
}
