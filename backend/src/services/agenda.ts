import { env } from "../config/env.js";
import { calcularAbono } from "../domain/abono.js";
import { horasLibres, seTraslapan } from "../domain/horarios.js";
import { AHORA_LOCAL_SQL, esViolacionRestriccion, getPool, transaccion } from "../db/pg.js";
import * as catalogo from "../repositories/catalogo.js";
import * as citas from "../repositories/citas.js";
import { registrarAuditoria } from "../repositories/usuarios.js";
import { ErrorNegocio, HorarioNoDisponible, NoEncontrado, Prohibido } from "../util/errores.js";
import { diaSemana, esFechaHoraValida, esFechaValida, normalizar, sumarMinutos } from "../util/fechas.js";
import { notificar } from "./notificaciones.js";

async function ahoraLocal(): Promise<string> {
  const r = await getPool().query(`SELECT ${AHORA_LOCAL_SQL} AS ahora`);
  return (r.rows[0].ahora as string).slice(0, 16);
}

/** HU-01: horas libres de un profesional para un servicio en una fecha. */
export async function horasDisponibles(p: { idProfesional: number; idServicio: number; fecha: string }) {
  if (!esFechaValida(p.fecha)) throw new ErrorNegocio("FECHA_INVALIDA", "La fecha no es válida.", 422);
  const cx = getPool();
  const servicio = await catalogo.obtenerServicio(cx, p.idServicio);
  if (!servicio) throw new NoEncontrado("No encontramos ese servicio.");
  if (!(await catalogo.profesionalRealizaServicio(cx, p.idProfesional, p.idServicio))) {
    throw new NoEncontrado("Ese profesional no realiza este servicio.");
  }
  await citas.expirarVencidas(cx, p.idProfesional);
  const ventanas = await catalogo.ventanasDelDia(cx, p.idProfesional, diaSemana(p.fecha));
  const ocupadosCitas = await citas.ocupadosDelDia(cx, p.idProfesional, p.fecha);
  const bloqueos = await catalogo.bloqueosEnRango(cx, p.idProfesional, `${p.fecha}T00:00`, sumarMinutos(`${p.fecha}T00:00`, 24 * 60));
  const ocupados = [
    ...ocupadosCitas,
    ...bloqueos.map((b) => ({ inicio: b.inicio.slice(0, 16), fin: b.fin.slice(0, 16) })),
  ];
  return horasLibres({
    fecha: p.fecha,
    ventanas,
    duracionMin: servicio.duracion_min,
    ocupados,
    ahoraLocal: await ahoraLocal(),
  });
}

/**
 * Valida que un servicio se pueda realizar con un profesional en un horario: profesional y servicio
 * existen y son compatibles, no es pasado, cabe en la jornada, no choca con un bloqueo y no se traslapa
 * con otra cita (RN-02). Debe llamarse dentro de una transacción: bloquea al profesional.
 * Al reprogramar, excluirIdCita deja fuera a la propia cita.
 */
async function validarHorario(
  cx: import("pg").PoolClient,
  p: { idProfesional: number; idServicio: number; inicio: string; excluirIdCita?: number },
) {
  const servicio = await catalogo.obtenerServicio(cx, p.idServicio);
  if (!servicio) throw new NoEncontrado("No encontramos ese servicio.");
  if (!(await citas.bloquearProfesional(cx, p.idProfesional))) {
    throw new NoEncontrado("No encontramos a ese profesional.");
  }
  if (!(await catalogo.profesionalRealizaServicio(cx, p.idProfesional, p.idServicio))) {
    throw new NoEncontrado("Ese profesional no realiza este servicio.");
  }

  const fin = sumarMinutos(p.inicio, servicio.duracion_min);
  const ahora = (await cx.query(`SELECT ${AHORA_LOCAL_SQL} AS ahora`)).rows[0].ahora as string;
  if (p.inicio <= ahora.slice(0, 16)) throw new HorarioNoDisponible("Ese horario ya pasó. Elige otro.");

  // Debe caber completo en una ventana de atención del día
  const fecha = p.inicio.slice(0, 10);
  const ventanas = await catalogo.ventanasDelDia(cx, p.idProfesional, diaSemana(fecha));
  const cabe = ventanas.some((v) => p.inicio >= `${fecha}T${v.desde}` && fin <= `${fecha}T${v.hasta}`);
  if (!cabe) throw new HorarioNoDisponible("Ese horario está fuera del horario de atención.");

  const bloqueos = await catalogo.bloqueosEnRango(cx, p.idProfesional, p.inicio, fin);
  if (bloqueos.some((b) => seTraslapan({ inicio: p.inicio, fin }, { inicio: b.inicio.slice(0, 16), fin: b.fin.slice(0, 16) }))) {
    throw new HorarioNoDisponible();
  }

  // Libera lo vencido antes de comparar, y luego verifica el traslape (capa de servicio)
  await citas.expirarVencidas(cx, p.idProfesional);
  if (await citas.hayTraslape(cx, p.idProfesional, p.inicio, fin, p.excluirIdCita)) throw new HorarioNoDisponible();
  return { servicio, fin };
}

/**
 * RN-01, RN-02, RN-04: crea una cita PENDIENTE_PAGO con el abono calculado en el servidor,
 * retenida 15 minutos. La verificación de traslape se hace dentro de una transacción con
 * bloqueo del profesional; la restricción de exclusión de la base de datos es la segunda capa.
 */
export async function reservar(p: {
  idCliente: number;
  idServicio: number;
  idProfesional: number;
  inicio: string;
}) {
  if (!esFechaHoraValida(p.inicio)) throw new ErrorNegocio("FECHA_INVALIDA", "La fecha y hora no son válidas.", 422);
  const inicio = normalizar(p.inicio);

  try {
    return await transaccion(async (cx) => {
      const { servicio, fin } = await validarHorario(cx, { idProfesional: p.idProfesional, idServicio: p.idServicio, inicio });
      return citas.insertarCita(cx, {
        id_cliente: p.idCliente,
        id_servicio: p.idServicio,
        id_profesional: p.idProfesional,
        inicio,
        fin,
        monto_abono: calcularAbono(servicio.precio, servicio.pct_abono),
        retencion_min: env.RETENCION_MINUTOS,
      });
    });
  } catch (e) {
    // Segunda capa: si la restricción de la base de datos detecta un traslape, es el mismo caso.
    if (esViolacionRestriccion(e)) throw new HorarioNoDisponible();
    throw e;
  }
}

export interface Actor {
  id_usuario: number;
  rol: "CLIENTA" | "PROFESIONAL" | "ADMIN";
  id_cliente: number | null;
}

/** RN-05: la clienta cancela su cita; la cancelación libera el horario. */
export async function cancelar(idCita: number, actor: Actor) {
  const resultado = await transaccion(async (cx) => {
    const cita = await citas.obtenerCita(cx, idCita, true);
    if (!cita) throw new NoEncontrado("No encontramos esa cita.");
    // Autorización por propietario: la clienta solo cancela lo propio.
    if (actor.rol === "CLIENTA" && cita.id_cliente !== actor.id_cliente) throw new Prohibido();
    if (actor.rol === "PROFESIONAL") throw new Prohibido();
    if (cita.estado === "CANCELADA" || cita.estado === "EXPIRADA") {
      throw new ErrorNegocio("CITA_NO_CANCELABLE", "Esta cita ya no está activa.", 409);
    }
    const tenia_abono_pagado = cita.estado === "CONFIRMADA";
    await citas.cambiarEstado(cx, idCita, "CANCELADA");
    if (actor.rol === "ADMIN") {
      await registrarAuditoria(cx, actor.id_usuario, "CANCELAR_CITA_EN_NOMBRE", `id_cita=${idCita}`);
    }
    return { id_cita: idCita, estado: "CANCELADA" as const, tenia_abono_pagado };
  });
  await notificar("CITA_CANCELADA", { id_cita: idCita });
  return {
    ...resultado,
    // Política asumida (a confirmar con RG Beauty): la devolución del abono la revisa administración.
    politica_abono: resultado.tenia_abono_pagado
      ? "Tu horario quedó libre. La administración revisará la devolución de tu abono."
      : "Tu horario quedó libre. No se cobró ningún abono.",
  };
}

/** Marca como EXPIRADA toda cita sin pago vencida. Lo ejecuta una tarea periódica. */
export async function expirarCitasVencidas(): Promise<number> {
  return citas.expirarVencidas(getPool());
}

/**
 * UPDATE de una cita: la mueve a otro horario con el mismo profesional y servicio.
 * Conserva el estado, el abono y los pagos. Solo la dueña o administración; solo citas activas y futuras.
 */
export async function reprogramar(idCita: number, nuevoInicio: string, actor: Actor) {
  if (!esFechaHoraValida(nuevoInicio)) throw new ErrorNegocio("FECHA_INVALIDA", "La fecha y hora no son válidas.", 422);
  const inicio = normalizar(nuevoInicio);
  try {
    return await transaccion(async (cx) => {
      const cita = await citas.obtenerCita(cx, idCita, true);
      if (!cita) throw new NoEncontrado("No encontramos esa cita.");
      if (actor.rol === "CLIENTA" && cita.id_cliente !== actor.id_cliente) throw new Prohibido();
      if (actor.rol === "PROFESIONAL") throw new Prohibido();
      if (cita.estado !== "CONFIRMADA" && cita.estado !== "PENDIENTE_PAGO") {
        throw new ErrorNegocio("CITA_NO_REPROGRAMABLE", "Esta cita ya no está activa, no se puede reprogramar.", 409);
      }
      const ahora = (await cx.query(`SELECT ${AHORA_LOCAL_SQL} AS ahora`)).rows[0].ahora as string;
      if (cita.fecha_hora <= ahora.slice(0, 16)) {
        throw new ErrorNegocio("CITA_NO_REPROGRAMABLE", "La cita ya comenzó o pasó, no se puede reprogramar.", 409);
      }
      if (inicio === cita.fecha_hora) throw new ErrorNegocio("SIN_CAMBIOS", "Elige un horario distinto al actual.", 422);

      const { fin } = await validarHorario(cx, {
        idProfesional: cita.id_profesional,
        idServicio: cita.id_servicio,
        inicio,
        excluirIdCita: idCita,
      });
      await citas.actualizarHorario(cx, idCita, inicio, fin);
      if (actor.rol === "ADMIN") {
        await registrarAuditoria(cx, actor.id_usuario, "REPROGRAMAR_CITA", `id_cita=${idCita}`);
      }
      return (await citas.detalleDeCita(cx, idCita))!;
    });
  } catch (e) {
    if (esViolacionRestriccion(e)) throw new HorarioNoDisponible();
    throw e;
  }
}

/**
 * DELETE de una cita (solo administración). Una cita con pago aprobado o revertido es un registro
 * contable y no se borra: se cancela. Solo se eliminan citas canceladas o expiradas sin esos pagos.
 */
export async function eliminarCita(idCita: number, idUsuario: number) {
  await transaccion(async (cx) => {
    const cita = await citas.obtenerCita(cx, idCita, true);
    if (!cita) throw new NoEncontrado("No encontramos esa cita.");
    if (cita.estado !== "CANCELADA" && cita.estado !== "EXPIRADA") {
      throw new ErrorNegocio("CITA_NO_ELIMINABLE", "Solo se pueden eliminar citas canceladas o expiradas. Cancela esta cita primero.", 409);
    }
    const pagos = await citas.contarPagosPorEstado(cx, idCita);
    if ((pagos.APROBADO ?? 0) + (pagos.REVERTIDO ?? 0) > 0) {
      throw new ErrorNegocio("CITA_CON_PAGOS", "Esta cita tiene pagos registrados y se conserva como historial contable.", 409);
    }
    await citas.eliminarCita(cx, idCita);
    await registrarAuditoria(cx, idUsuario, "ELIMINAR_CITA", `id_cita=${idCita}`);
  });
}
