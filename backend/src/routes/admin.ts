import { Router } from "express";
import { getPool } from "../db/pg.js";
import * as catalogo from "../repositories/catalogo.js";
import * as citas from "../repositories/citas.js";
import { ah, autenticar, requiereRol } from "../security/middleware.js";
import { eliminarCita } from "../services/agenda.js";
import * as admin from "../services/catalogoAdmin.js";
import { ErrorNegocio, NoEncontrado } from "../util/errores.js";
import { esFechaValida, minutosEntre } from "../util/fechas.js";
import {
  esquemaHorarioSemanal, esquemaId, esquemaProfesional, esquemaReporte, esquemaServicio,
} from "./esquemas.js";

// Todo lo de este archivo es solo para administración.
export const rutasAdmin = Router();
rutasAdmin.use("/admin", autenticar, requiereRol("ADMIN"));

// ---- Servicios: crear, consultar (público en GET /api/servicios), actualizar, eliminar ----
rutasAdmin.post("/admin/servicios", ah(async (req, res) => {
  res.status(201).json(await admin.crearServicio(esquemaServicio.parse(req.body), req.sesion!.sub));
}));
rutasAdmin.put("/admin/servicios/:id", ah(async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  res.json(await admin.actualizarServicio(id, esquemaServicio.parse(req.body), req.sesion!.sub));
}));
rutasAdmin.delete("/admin/servicios/:id", ah(async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  await admin.eliminarServicio(id, req.sesion!.sub);
  res.status(204).end();
}));

// ---- Profesionales ----
rutasAdmin.get("/admin/profesionales", ah(async (_req, res) => {
  res.json(await catalogo.listarProfesionalesConServicios(getPool()));
}));
rutasAdmin.post("/admin/profesionales", ah(async (req, res) => {
  res.status(201).json(await admin.crearProfesional(esquemaProfesional.parse(req.body), req.sesion!.sub));
}));
rutasAdmin.put("/admin/profesionales/:id", ah(async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  res.json(await admin.actualizarProfesional(id, esquemaProfesional.parse(req.body), req.sesion!.sub));
}));
rutasAdmin.delete("/admin/profesionales/:id", ah(async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  await admin.eliminarProfesional(id, req.sesion!.sub);
  res.status(204).end();
}));

// ---- Horario semanal de un profesional ----
rutasAdmin.get("/admin/profesionales/:id/horario", ah(async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  if (!(await catalogo.obtenerProfesional(getPool(), id))) throw new NoEncontrado("No encontramos a ese profesional.");
  res.json(await catalogo.ventanasDeProfesional(getPool(), id));
}));
rutasAdmin.put("/admin/profesionales/:id/horario", ah(async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  const { ventanas } = esquemaHorarioSemanal.parse(req.body);
  res.json(await admin.guardarHorarioSemanal(id, ventanas, req.sesion!.sub));
}));

// ---- Citas: eliminar (solo canceladas o expiradas sin pagos contables) ----
rutasAdmin.delete("/admin/citas/:id", ah(async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  await eliminarCita(id, req.sesion!.sub);
  res.status(204).end();
}));

// ---- Reporte de citas por rango de fechas (consulta la base en cada llamada) ----
rutasAdmin.get("/admin/reporte/citas", ah(async (req, res) => {
  const q = esquemaReporte.parse(req.query);
  if (!esFechaValida(q.desde) || !esFechaValida(q.hasta) || q.hasta < q.desde) {
    throw new ErrorNegocio("RANGO_INVALIDO", "El rango de fechas no es válido.", 422);
  }
  if (minutosEntre(`${q.desde}T00:00`, `${q.hasta}T00:00`) > 366 * 24 * 60) {
    throw new ErrorNegocio("RANGO_INVALIDO", "El rango máximo es de un año.", 422);
  }
  await citas.expirarVencidas(getPool());
  const filas = await citas.reporteCitas(getPool(), {
    desde: q.desde, hasta: q.hasta, estado: q.estado, idProfesional: q.id_profesional, idServicio: q.id_servicio,
  });
  const totales = {
    cantidad: filas.length,
    abono_pagado: filas.reduce((s, c) => s + c.pagado, 0),
    abono_pendiente: filas.filter((c) => c.estado === "PENDIENTE_PAGO").reduce((s, c) => s + c.monto_abono, 0),
  };
  res.json({ filas, totales, limitado: filas.length >= 1000 });
}));
