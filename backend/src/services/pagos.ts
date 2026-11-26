import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { getPool, transaccion } from "../db/pg.js";
import * as citas from "../repositories/citas.js";
import * as repoPagos from "../repositories/pagos.js";
import { registrarAuditoria } from "../repositories/usuarios.js";
import { ErrorNegocio, NoEncontrado, PagoInvalido } from "../util/errores.js";
import { randomUUID } from "node:crypto";
import { notificar } from "./notificaciones.js";

export interface NotificacionPago {
  referencia_externa: string;
  id_cita: number;
  monto: number;
  estado: "APROBADO" | "RECHAZADO";
}

export type ResultadoPago = "PROCESADO" | "DUPLICADO_IGNORADO" | "RECHAZO_REGISTRADO";

// ---- Firma del webhook (A2, PI-10): HMAC-SHA256 del cuerpo exacto con el secreto compartido ----

export function firmar(cuerpo: string, secreto = env.PASARELA_SECRET): string {
  return createHmac("sha256", secreto).update(cuerpo).digest("hex");
}

export function firmaValida(cuerpo: string, firma: string | undefined, secreto = env.PASARELA_SECRET): boolean {
  if (!firma) return false;
  const esperada = Buffer.from(firmar(cuerpo, secreto), "hex");
  let recibida: Buffer;
  try {
    recibida = Buffer.from(firma, "hex");
  } catch {
    return false;
  }
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/**
 * RN-03: la cita queda CONFIRMADA solo tras un pago APROBADO por el monto exacto del abono.
 * Idempotente: una notificación repetida (misma referencia_externa) no crea otro pago ni otra
 * confirmación. Todo ocurre en una sola transacción con la cita bloqueada.
 */
export async function procesarNotificacionPago(n: NotificacionPago): Promise<ResultadoPago> {
  if (!Number.isInteger(n.monto) || n.monto <= 0) throw new PagoInvalido("El monto del pago no es válido.");
  if (!n.referencia_externa || n.referencia_externa.length > 100) throw new PagoInvalido("Referencia de pago inválida.");

  // La expiración se confirma ANTES de la transacción de pago: si el pago se rechaza por tardío,
  // el cambio a EXPIRADA no debe deshacerse con la reversa de la transacción.
  await citas.expirarVencidas(getPool());

  const resultado = await transaccion(async (cx): Promise<ResultadoPago> => {
    const previa = await citas.obtenerCita(cx, n.id_cita, true); // bloquea la fila
    if (!previa) throw new NoEncontrado("No encontramos esa cita.");

    if (await repoPagos.obtenerPorReferencia(cx, n.referencia_externa)) return "DUPLICADO_IGNORADO";

    // Si el plazo de 15 minutos ya venció, se libera antes de decidir.
    await citas.expirarVencidas(cx, previa.id_profesional);
    const cita = (await citas.obtenerCita(cx, n.id_cita, false))!;

    if (n.estado === "RECHAZADO") {
      await repoPagos.insertarPago(cx, { ...n, estado: "RECHAZADO" });
      return "RECHAZO_REGISTRADO"; // la cita sigue PENDIENTE_PAGO
    }

    if (cita.estado !== "PENDIENTE_PAGO") {
      throw new PagoInvalido("Esta cita ya no admite pago (venció o fue cancelada).");
    }
    if (n.monto !== cita.monto_abono) {
      throw new PagoInvalido("El monto pagado no coincide con el abono de la cita.");
    }
    await repoPagos.insertarPago(cx, { ...n, estado: "APROBADO" });
    await citas.cambiarEstado(cx, cita.id_cita, "CONFIRMADA");
    return "PROCESADO";
  });

  if (resultado === "PROCESADO") await notificar("CITA_CONFIRMADA", { id_cita: n.id_cita });
  return resultado;
}

/** Pasarela SIMULADA: arma la notificación como lo haría el proveedor y la entrega firmada. */
export function armarNotificacionSimulada(p: {
  id_cita: number;
  monto: number;
  resultado: "APROBADO" | "RECHAZADO";
}): { cuerpo: string; firma: string } {
  const cuerpo = JSON.stringify({
    referencia_externa: `SIM-${randomUUID()}`,
    id_cita: p.id_cita,
    monto: p.monto,
    estado: p.resultado,
  });
  return { cuerpo, firma: firmar(cuerpo) };
}

/** RN-06: registrar un pago manual (transferencia o efectivo). Solo perfil autorizado, con auditoría. */
export async function registrarPagoManual(idCita: number, idUsuario: number): Promise<ResultadoPago> {
  const cita = await citas.obtenerCita(getPool(), idCita);
  if (!cita) throw new NoEncontrado("No encontramos esa cita.");
  const r = await procesarNotificacionPago({
    referencia_externa: `MANUAL-${randomUUID()}`,
    id_cita: idCita,
    monto: cita.monto_abono,
    estado: "APROBADO",
  });
  await registrarAuditoria(getPool(), idUsuario, "REGISTRAR_PAGO_MANUAL", `id_cita=${idCita}`);
  return r;
}

/** RN-06: revertir un pago aprobado. Sin abono la cita deja de estar confirmada y libera el horario. */
export async function revertirPago(idPago: number, idUsuario: number) {
  const idCita = await transaccion(async (cx) => {
    const pago = await repoPagos.obtenerPago(cx, idPago, true);
    if (!pago) throw new NoEncontrado("No encontramos ese pago.");
    if (pago.estado !== "APROBADO") {
      throw new ErrorNegocio("PAGO_NO_REVERTIBLE", "Solo se puede revertir un pago aprobado.", 409);
    }
    await repoPagos.marcarRevertido(cx, idPago);
    const cita = await citas.obtenerCita(cx, pago.id_cita, true);
    if (cita && cita.estado === "CONFIRMADA") await citas.cambiarEstado(cx, cita.id_cita, "CANCELADA");
    await registrarAuditoria(cx, idUsuario, "REVERTIR_PAGO", `id_pago=${idPago};id_cita=${pago.id_cita}`);
    return pago.id_cita;
  });
  await notificar("PAGO_REVERTIDO", { id_cita: idCita });
  return { id_pago: idPago, id_cita: idCita, estado: "REVERTIDO" as const };
}
