import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "../src/db/pg.js";
import type { IdsDemo } from "../src/db/datosDemo.js";
import { contarPagosDeCita } from "../src/repositories/pagos.js";
import { obtenerCita } from "../src/repositories/citas.js";
import { cancelar, horasDisponibles, reservar } from "../src/services/agenda.js";
import { procesarNotificacionPago, revertirPago } from "../src/services/pagos.js";
import { indicadores } from "../src/services/reportes.js";
import { HorarioNoDisponible, PagoInvalido, Prohibido } from "../src/util/errores.js";
import { cerrarPool, prepararDemo } from "./helpers.js";

let ids: IdsDemo;
let martes: string;

beforeEach(async () => {
  ({ ids, martes } = await prepararDemo());
});
afterAll(cerrarPool);

const reservarManicure = (hora: string, cliente = () => ids.clientas.daniela) =>
  reservar({ idCliente: cliente(), idServicio: ids.servicios.manicure, idProfesional: ids.profesionales.a, inicio: `${martes}T${hora}` });

describe("Reservas y anti-traslape (RN-02)", () => {
  it("PI-01 rechaza un traslape parcial (10:30 contra una cita de 10:00 a 11:00)", async () => {
    await expect(reservarManicure("10:30")).rejects.toBeInstanceOf(HorarioNoDisponible);
    const n = await getPool().query("SELECT count(*)::int n FROM cita WHERE id_profesional=$1", [ids.profesionales.a]);
    expect(n.rows[0].n).toBe(1);
  });

  it("PI-02 horario libre: queda PENDIENTE_PAGO con el abono calculado en el servidor", async () => {
    const c = await reservarManicure("12:00");
    expect(c.estado).toBe("PENDIENTE_PAGO");
    expect(c.monto_abono).toBe(6000);
    expect(c.expira_en).not.toBeNull();
  });

  it("PI-03b la clienta no puede reservar fuera del horario de atención ni en el pasado", async () => {
    await expect(reservarManicure("08:00")).rejects.toBeInstanceOf(HorarioNoDisponible); // antes de abrir
    await expect(reservarManicure("13:30")).rejects.toBeInstanceOf(HorarioNoDisponible); // colación 13-14
    await expect(
      reservar({ idCliente: ids.clientas.daniela, idServicio: ids.servicios.manicure, idProfesional: ids.profesionales.a, inicio: "2020-01-07T10:00" }),
    ).rejects.toBeInstanceOf(HorarioNoDisponible);
  });

  it("PI-06 la base de datos impide traslapes aunque se salte el servicio (restricción de exclusión)", async () => {
    const insertar = (ini: string, fin: string) =>
      getPool().query(
        `INSERT INTO cita (id_cliente,id_servicio,id_profesional,fecha_hora,fecha_hora_fin,estado,monto_abono)
         VALUES ($1,$2,$3,$4,$5,'CONFIRMADA',6000)`,
        [ids.clientas.daniela, ids.servicios.manicure, ids.profesionales.a, `${martes} ${ini}`, `${martes} ${fin}`],
      );
    await expect(insertar("10:00", "11:00")).rejects.toMatchObject({ code: "23P01" }); // mismo inicio
    await expect(insertar("10:30", "11:30")).rejects.toMatchObject({ code: "23P01" }); // traslape parcial
    await expect(insertar("11:00", "12:00")).resolves.toBeDefined(); // borde contra borde: permitido
  });

  it("PI-07 cancelar libera el horario", async () => {
    const citaA = (await getPool().query("SELECT id_cita FROM cita WHERE id_profesional=$1", [ids.profesionales.a])).rows[0].id_cita;
    await cancelar(citaA, { id_usuario: 1, rol: "CLIENTA", id_cliente: ids.clientas.camila });
    const nueva = await reservarManicure("10:00");
    expect(nueva.estado).toBe("PENDIENTE_PAGO");
  });

  it("PI-08 concurrencia: 5 solicitudes simultáneas al mismo horario, solo una queda", async () => {
    const clientas = [ids.clientas.camila, ids.clientas.valentina, ids.clientas.daniela, ids.clientas.camila, ids.clientas.valentina];
    const resultados = await Promise.allSettled(
      clientas.map((idCliente) =>
        reservar({ idCliente, idServicio: ids.servicios.manicure, idProfesional: ids.profesionales.a, inicio: `${martes}T15:00` }),
      ),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of resultados.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(HorarioNoDisponible);
    }
    const n = await getPool().query("SELECT count(*)::int n FROM cita WHERE id_profesional=$1 AND fecha_hora=$2", [ids.profesionales.a, `${martes} 15:00`]);
    expect(n.rows[0].n).toBe(1);
  });

  it("PI-11 horas disponibles excluye lo ocupado y lo bloqueado", async () => {
    const libres = await horasDisponibles({ idProfesional: ids.profesionales.a, idServicio: ids.servicios.manicure, fecha: martes });
    expect(libres).toContain("09:00");
    expect(libres).toContain("11:00");
    expect(libres).not.toContain("09:30");
    expect(libres).not.toContain("10:00");
    expect(libres).not.toContain("10:30");
    await getPool().query("INSERT INTO bloqueo (id_profesional, inicio, fin) VALUES ($1,$2,$3)", [ids.profesionales.a, `${martes} 15:00`, `${martes} 17:00`]);
    const conBloqueo = await horasDisponibles({ idProfesional: ids.profesionales.a, idServicio: ids.servicios.manicure, fecha: martes });
    expect(conBloqueo).toContain("14:00");
    expect(conBloqueo).not.toContain("15:00");
    expect(conBloqueo).not.toContain("16:30");
    expect(conBloqueo).toContain("17:00");
  });

  it("PI-12 un profesional solo ofrece los servicios que realiza", async () => {
    await expect(
      reservar({ idCliente: ids.clientas.daniela, idServicio: ids.servicios.masaje, idProfesional: ids.profesionales.a, inicio: `${martes}T12:00` }),
    ).rejects.toMatchObject({ codigo: "NO_ENCONTRADO" });
  });
});

describe("Pago del abono (RN-03)", () => {
  it("PI-03 confirma solo tras pago válido y una notificación repetida se ignora", async () => {
    const c = await reservarManicure("12:00");
    const n = { referencia_externa: "PSP-9001", id_cita: c.id_cita, monto: 6000, estado: "APROBADO" as const };
    expect(await procesarNotificacionPago(n)).toBe("PROCESADO");
    expect(await procesarNotificacionPago(n)).toBe("DUPLICADO_IGNORADO");
    expect((await obtenerCita(getPool(), c.id_cita))!.estado).toBe("CONFIRMADA");
    expect(await contarPagosDeCita(getPool(), c.id_cita)).toBe(1);
  });

  it("PI-03c la misma notificación llegando 5 veces a la vez genera un solo pago", async () => {
    const c = await reservarManicure("12:00");
    const n = { referencia_externa: "PSP-9002", id_cita: c.id_cita, monto: 6000, estado: "APROBADO" as const };
    const r = await Promise.all([1, 2, 3, 4, 5].map(() => procesarNotificacionPago(n)));
    expect(r.filter((x) => x === "PROCESADO")).toHaveLength(1);
    expect(r.filter((x) => x === "DUPLICADO_IGNORADO")).toHaveLength(4);
    expect(await contarPagosDeCita(getPool(), c.id_cita)).toBe(1);
  });

  it("PI-04 un pago rechazado no confirma y la clienta puede reintentar", async () => {
    const c = await reservarManicure("12:00");
    expect(await procesarNotificacionPago({ referencia_externa: "PSP-9003", id_cita: c.id_cita, monto: 6000, estado: "RECHAZADO" })).toBe("RECHAZO_REGISTRADO");
    expect((await obtenerCita(getPool(), c.id_cita))!.estado).toBe("PENDIENTE_PAGO");
    expect(await procesarNotificacionPago({ referencia_externa: "PSP-9004", id_cita: c.id_cita, monto: 6000, estado: "APROBADO" })).toBe("PROCESADO");
    expect((await obtenerCita(getPool(), c.id_cita))!.estado).toBe("CONFIRMADA");
  });

  it("PI-05 monto manipulado: se rechaza y no queda ningún pago aprobado", async () => {
    const c = await reservarManicure("12:00");
    await expect(
      procesarNotificacionPago({ referencia_externa: "PSP-9005", id_cita: c.id_cita, monto: 100, estado: "APROBADO" }),
    ).rejects.toBeInstanceOf(PagoInvalido);
    expect(await contarPagosDeCita(getPool(), c.id_cita)).toBe(0);
    expect((await obtenerCita(getPool(), c.id_cita))!.estado).toBe("PENDIENTE_PAGO");
  });

  it("PI-09 RN-04: sin pago a los 15 minutos la cita expira, libera el horario y un pago tardío se rechaza", async () => {
    const c = await reservarManicure("12:00");
    await getPool().query("UPDATE cita SET expira_en = (now() AT TIME ZONE 'America/Santiago') - interval '1 minute' WHERE id_cita=$1", [c.id_cita]);
    await expect(
      procesarNotificacionPago({ referencia_externa: "PSP-9006", id_cita: c.id_cita, monto: 6000, estado: "APROBADO" }),
    ).rejects.toBeInstanceOf(PagoInvalido);
    expect((await obtenerCita(getPool(), c.id_cita))!.estado).toBe("EXPIRADA");
    const otra = await reservarManicure("12:00", () => ids.clientas.valentina); // el horario volvió a estar libre
    expect(otra.estado).toBe("PENDIENTE_PAGO");
  });

  it("PI-13 revertir un pago cancela la cita, libera el horario y deja auditoría (RN-06)", async () => {
    const c = await reservarManicure("12:00");
    await procesarNotificacionPago({ referencia_externa: "PSP-9007", id_cita: c.id_cita, monto: 6000, estado: "APROBADO" });
    const idPago = (await getPool().query("SELECT id_pago FROM pago WHERE id_cita=$1", [c.id_cita])).rows[0].id_pago;
    const admin = (await getPool().query("SELECT id_usuario FROM usuario WHERE rol='ADMIN' AND autorizado_pagos")).rows[0].id_usuario;
    await revertirPago(idPago, admin);
    expect((await obtenerCita(getPool(), c.id_cita))!.estado).toBe("CANCELADA");
    expect((await getPool().query("SELECT estado FROM pago WHERE id_pago=$1", [idPago])).rows[0].estado).toBe("REVERTIDO");
    expect((await getPool().query("SELECT count(*)::int n FROM auditoria WHERE accion='REVERTIR_PAGO'")).rows[0].n).toBe(1);
    await expect(revertirPago(idPago, admin)).rejects.toMatchObject({ codigo: "PAGO_NO_REVERTIBLE" });
  });

  it("PI-14 cancelación: solo la dueña, y una cita ya cancelada no se cancela de nuevo", async () => {
    const c = await reservarManicure("12:00");
    await expect(cancelar(c.id_cita, { id_usuario: 9, rol: "CLIENTA", id_cliente: ids.clientas.camila })).rejects.toBeInstanceOf(Prohibido);
    const ok = await cancelar(c.id_cita, { id_usuario: 9, rol: "CLIENTA", id_cliente: ids.clientas.daniela });
    expect(ok.estado).toBe("CANCELADA");
    expect(ok.politica_abono).toMatch(/No se cobró/);
    await expect(cancelar(c.id_cita, { id_usuario: 9, rol: "CLIENTA", id_cliente: ids.clientas.daniela })).rejects.toMatchObject({ codigo: "CITA_NO_CANCELABLE" });
  });
});

describe("Indicadores (HU-07)", () => {
  it("PI-15 ocupación, cancelación, tiempo muerto y traslapes", async () => {
    // martes: A 10-11 (confirmada) y B 10-11:15 (confirmada). Agrego una de B a las 14:00 y cancelo otra.
    const b2 = await reservar({ idCliente: ids.clientas.daniela, idServicio: ids.servicios.masaje, idProfesional: ids.profesionales.b, inicio: `${martes}T14:00` });
    await procesarNotificacionPago({ referencia_externa: "PSP-9100", id_cita: b2.id_cita, monto: 10000, estado: "APROBADO" });
    const a2 = await reservarManicure("12:00");
    await procesarNotificacionPago({ referencia_externa: "PSP-9101", id_cita: a2.id_cita, monto: 6000, estado: "APROBADO" });
    const admin = (await getPool().query("SELECT id_usuario FROM usuario WHERE rol='ADMIN' LIMIT 1")).rows[0].id_usuario;
    await cancelar(a2.id_cita, { id_usuario: admin, rol: "ADMIN", id_cliente: null });

    const r = await indicadores(martes, martes);
    expect(r.citas_confirmadas).toBe(3);
    expect(r.citas_canceladas).toBe(1);
    expect(r.cancelacion_pct).toBe(25); // 1 de 4 agendadas
    expect(r.traslapes).toBe(0);
    // B: 10:00-11:15 y 14:00-15:00 -> hueco de 165 min
    expect(r.tiempo_muerto_min).toBe(165);
    // disponibles el martes: 2 profesionales x (4 h + 5 h) = 1.080 min; atendidos 60 + 75 + 60 = 195
    expect(r.ocupacion_pct).toBe(18.1);
  });

  it("PI-16 rechaza rangos inválidos", async () => {
    await expect(indicadores("2026-12-10", "2026-12-01")).rejects.toMatchObject({ codigo: "RANGO_INVALIDO" });
  });
});
