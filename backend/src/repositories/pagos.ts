import type { Consultable } from "../db/pg.js";

export type EstadoPago = "APROBADO" | "RECHAZADO" | "REVERTIDO";

export interface Pago {
  id_pago: number;
  id_cita: number;
  monto: number;
  estado: EstadoPago;
  referencia_externa: string;
}

export async function obtenerPorReferencia(cx: Consultable, referencia: string): Promise<Pago | undefined> {
  const r = await cx.query(
    "SELECT id_pago, id_cita, monto, estado, referencia_externa FROM pago WHERE referencia_externa = $1",
    [referencia],
  );
  return r.rows[0];
}

export async function insertarPago(
  cx: Consultable,
  p: { id_cita: number; monto: number; estado: EstadoPago; referencia_externa: string },
): Promise<Pago> {
  const r = await cx.query(
    `INSERT INTO pago (id_cita, monto, estado, referencia_externa) VALUES ($1, $2, $3, $4)
     RETURNING id_pago, id_cita, monto, estado, referencia_externa`,
    [p.id_cita, p.monto, p.estado, p.referencia_externa],
  );
  return r.rows[0];
}

export async function obtenerPago(cx: Consultable, id: number, bloquear = false): Promise<Pago | undefined> {
  const r = await cx.query(
    `SELECT id_pago, id_cita, monto, estado, referencia_externa FROM pago WHERE id_pago = $1 ${bloquear ? "FOR UPDATE" : ""}`,
    [id],
  );
  return r.rows[0];
}

export async function marcarRevertido(cx: Consultable, id: number): Promise<void> {
  await cx.query("UPDATE pago SET estado = 'REVERTIDO' WHERE id_pago = $1", [id]);
}

export async function contarPagosDeCita(cx: Consultable, idCita: number): Promise<number> {
  const r = await cx.query("SELECT count(*)::int AS n FROM pago WHERE id_cita = $1", [idCita]);
  return r.rows[0].n;
}

export async function listarPagos(cx: Consultable, limite = 100) {
  const r = await cx.query(
    `SELECT pg.id_pago, pg.id_cita, pg.monto, pg.estado, pg.referencia_externa, cl.nombre AS cliente
       FROM pago pg JOIN cita c ON c.id_cita = pg.id_cita JOIN cliente cl ON cl.id_cliente = c.id_cliente
      ORDER BY pg.id_pago DESC LIMIT $1`,
    [limite],
  );
  return r.rows as (Pago & { cliente: string })[];
}
