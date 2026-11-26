import pg from "pg";
import { env } from "../config/env.js";

// timestamp (sin zona) y date llegan como texto, sin conversión a Date ni a la zona del servidor.
pg.types.setTypeParser(1114, (v: string) => v.replace(" ", "T").replace(/\.\d+$/, ""));
pg.types.setTypeParser(1082, (v: string) => v);

export type Consultable = Pick<pg.Pool | pg.PoolClient, "query">;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
  return pool;
}

export async function cerrarPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Ejecuta fn dentro de una transacción; revierte si lanza un error. */
export async function transaccion<T>(fn: (cx: pg.PoolClient) => Promise<T>): Promise<T> {
  const cx = await getPool().connect();
  try {
    await cx.query("BEGIN");
    const r = await fn(cx);
    await cx.query("COMMIT");
    return r;
  } catch (e) {
    await cx.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    cx.release();
  }
}

/** Hora local de Chile según el servidor de base de datos (AAAA-MM-DDTHH:MM:SS). */
export const AHORA_LOCAL_SQL = "(now() AT TIME ZONE 'America/Santiago')";

export function esViolacionRestriccion(e: unknown): boolean {
  const code = (e as { code?: string }).code;
  return code === "23P01" || code === "23505"; // exclusión o único
}
