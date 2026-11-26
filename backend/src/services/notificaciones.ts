import { log } from "../util/log.js";

export type EventoCita = "CITA_CONFIRMADA" | "CITA_CANCELADA" | "CITA_EXPIRADA" | "PAGO_REVERTIDO";

/**
 * HU-08: notificación por evento. En esta entrega el correo está SIMULADO: solo se deja un
 * registro sin datos personales. En producción, este es el único punto que se reemplaza por
 * el proveedor de correo transaccional (por ejemplo SES, SendGrid o Resend).
 */
export async function notificar(evento: EventoCita, datos: { id_cita: number }): Promise<void> {
  log.info("Notificación simulada", { evento, id_cita: datos.id_cita });
}
