import { Router } from "express";
import { getPool } from "../db/pg.js";
import * as citas from "../repositories/citas.js";
import { registrarAuditoria } from "../repositories/usuarios.js";
import { ah, autenticar, requiereRol } from "../security/middleware.js";
import * as agenda from "../services/agenda.js";
import { NoEncontrado, Prohibido } from "../util/errores.js";
import { esquemaCita, esquemaId, esquemaReprogramar } from "./esquemas.js";

export const rutasCitas = Router();
rutasCitas.use(autenticar);

// P4: reservar. La clienta sale del TOKEN, nunca del cuerpo (A5). Solo ADMIN puede indicar otra clienta.
rutasCitas.post(
  "/",
  requiereRol("CLIENTA", "ADMIN"),
  ah(async (req, res) => {
    const d = esquemaCita.parse(req.body);
    const s = req.sesion!;
    const idCliente = s.rol === "ADMIN" ? d.id_cliente : (s.idc ?? undefined);
    if (!idCliente) throw new Prohibido("Indica para qué clienta es la reserva.");
    const cita = await agenda.reservar({
      idCliente,
      idServicio: d.id_servicio,
      idProfesional: d.id_profesional,
      inicio: d.fecha_hora,
    });
    if (s.rol === "ADMIN") await registrarAuditoria(getPool(), s.sub, "RESERVAR_EN_NOMBRE", `id_cita=${cita.id_cita}`);
    res.status(201).json(cita);
  }),
);

// P7: mis citas
rutasCitas.get(
  "/mias",
  requiereRol("CLIENTA"),
  ah(async (req, res) => {
    await citas.expirarVencidas(getPool());
    res.json(await citas.citasDeCliente(getPool(), req.sesion!.idc!));
  }),
);

// Detalle de una cita: clienta propietaria, profesional asignado o administración (A5, PS-02)
rutasCitas.get(
  "/:id",
  ah(async (req, res) => {
    const { id } = esquemaId.parse(req.params);
    await citas.expirarVencidas(getPool());
    const c = await citas.detalleDeCita(getPool(), id);
    if (!c) throw new NoEncontrado("No encontramos esa cita.");
    const s = req.sesion!;
    const permitido =
      s.rol === "ADMIN" ||
      (s.rol === "CLIENTA" && c.id_cliente === s.idc) ||
      (s.rol === "PROFESIONAL" && c.id_profesional === s.idp);
    if (!permitido) throw new Prohibido();
    res.json(c);
  }),
);

// P8: cancelar
rutasCitas.post(
  "/:id/cancelar",
  requiereRol("CLIENTA", "ADMIN"),
  ah(async (req, res) => {
    const { id } = esquemaId.parse(req.params);
    const s = req.sesion!;
    res.json(await agenda.cancelar(id, { id_usuario: s.sub, rol: s.rol, id_cliente: s.idc }));
  }),
);

// UPDATE: reprogramar (mover a otro horario con el mismo profesional y servicio)
rutasCitas.put(
  "/:id/reprogramar",
  requiereRol("CLIENTA", "ADMIN"),
  ah(async (req, res) => {
    const { id } = esquemaId.parse(req.params);
    const d = esquemaReprogramar.parse(req.body);
    const s = req.sesion!;
    res.json(await agenda.reprogramar(id, d.fecha_hora, { id_usuario: s.sub, rol: s.rol, id_cliente: s.idc }));
  }),
);
