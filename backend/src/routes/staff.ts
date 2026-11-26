import { Router } from "express";
import { getPool } from "../db/pg.js";
import * as catalogo from "../repositories/catalogo.js";
import * as citas from "../repositories/citas.js";
import * as repoPagos from "../repositories/pagos.js";
import { listarAuditoria, registrarAuditoria } from "../repositories/usuarios.js";
import { ah, autenticar, requiereRol, requierePerfilPagos } from "../security/middleware.js";
import { indicadores } from "../services/reportes.js";
import { registrarPagoManual, revertirPago } from "../services/pagos.js";
import { ErrorNegocio, NoEncontrado, Prohibido } from "../util/errores.js";
import { esFechaHoraValida, esFechaValida, normalizar } from "../util/fechas.js";
import { esquemaAgenda, esquemaBloqueo, esquemaBloqueoCambios, esquemaId, esquemaIndicadores, esquemaPagoManual } from "./esquemas.js";

export const rutasStaff = Router();
rutasStaff.use(autenticar);

// A2: agenda del día. El profesional ve SOLO lo propio (el id sale del token); administración ve todo.
rutasStaff.get(
  "/agenda",
  requiereRol("PROFESIONAL", "ADMIN"),
  ah(async (req, res) => {
    const q = esquemaAgenda.parse(req.query);
    const s = req.sesion!;
    const idProfesional = s.rol === "PROFESIONAL" ? (s.idp ?? -1) : q.id_profesional;
    await citas.expirarVencidas(getPool());
    res.json(await citas.agendaDelDia(getPool(), q.fecha, idProfesional));
  }),
);

rutasStaff.get(
  "/profesionales",
  requiereRol("ADMIN"),
  ah(async (_req, res) => res.json(await catalogo.listarProfesionales(getPool()))),
);

// A3: disponibilidad (bloqueos de horario)
rutasStaff.get(
  "/bloqueos",
  requiereRol("PROFESIONAL", "ADMIN"),
  ah(async (req, res) => {
    const s = req.sesion!;
    res.json(await catalogo.listarBloqueosFuturos(getPool(), s.rol === "PROFESIONAL" ? (s.idp ?? -1) : undefined));
  }),
);

rutasStaff.post(
  "/bloqueos",
  requiereRol("PROFESIONAL", "ADMIN"),
  ah(async (req, res) => {
    const d = esquemaBloqueo.parse(req.body);
    const s = req.sesion!;
    const idProfesional = s.rol === "PROFESIONAL" ? s.idp : d.id_profesional;
    if (!idProfesional) throw new ErrorNegocio("DATOS_INVALIDOS", "Indica el profesional.", 422);
    if (!esFechaHoraValida(d.inicio) || !esFechaHoraValida(d.fin) || normalizar(d.fin) <= normalizar(d.inicio)) {
      throw new ErrorNegocio("DATOS_INVALIDOS", "El fin debe ser posterior al inicio.", 422);
    }
    const inicio = normalizar(d.inicio);
    const fin = normalizar(d.fin);
    const b = await catalogo.crearBloqueo(getPool(), { id_profesional: idProfesional, inicio, fin, motivo: d.motivo });
    await registrarAuditoria(getPool(), s.sub, "BLOQUEAR_HORARIO", `id_bloqueo=${b.id_bloqueo}`);
    // Avisa (no cancela) si ya hay citas activas en ese horario
    const activas = await citas.citasActivasEnIntervalo(getPool(), idProfesional, inicio, fin);
    res.status(201).json({ ...b, citas_activas_en_bloqueo: activas });
  }),
);

// Editar un bloqueo (UPDATE). El profesional solo edita los propios.
rutasStaff.put(
  "/bloqueos/:id",
  requiereRol("PROFESIONAL", "ADMIN"),
  ah(async (req, res) => {
    const { id } = esquemaId.parse(req.params);
    const d = esquemaBloqueoCambios.parse(req.body);
    const s = req.sesion!;
    const actual = await catalogo.obtenerBloqueo(getPool(), id);
    if (!actual) throw new NoEncontrado("No encontramos ese bloqueo.");
    if (s.rol === "PROFESIONAL" && actual.id_profesional !== s.idp) throw new Prohibido();
    if (!esFechaHoraValida(d.inicio) || !esFechaHoraValida(d.fin) || normalizar(d.fin) <= normalizar(d.inicio)) {
      throw new ErrorNegocio("DATOS_INVALIDOS", "El fin debe ser posterior al inicio.", 422);
    }
    const inicio = normalizar(d.inicio);
    const fin = normalizar(d.fin);
    const b = await catalogo.actualizarBloqueo(getPool(), id, { inicio, fin, motivo: d.motivo ?? null });
    await registrarAuditoria(getPool(), s.sub, "EDITAR_BLOQUEO", `id_bloqueo=${id}`);
    const activas = await citas.citasActivasEnIntervalo(getPool(), actual.id_profesional, inicio, fin);
    res.json({ ...b, citas_activas_en_bloqueo: activas });
  }),
);

rutasStaff.delete(
  "/bloqueos/:id",
  requiereRol("PROFESIONAL", "ADMIN"),
  ah(async (req, res) => {
    const { id } = esquemaId.parse(req.params);
    const s = req.sesion!;
    const b = await catalogo.obtenerBloqueo(getPool(), id);
    if (!b) throw new NoEncontrado("No encontramos ese bloqueo.");
    if (s.rol === "PROFESIONAL" && b.id_profesional !== s.idp) throw new Prohibido(); // solo la propia
    await catalogo.eliminarBloqueo(getPool(), id);
    await registrarAuditoria(getPool(), s.sub, "LIBERAR_HORARIO", `id_bloqueo=${id}`);
    res.status(204).end();
  }),
);

// A4: indicadores (solo administración)
rutasStaff.get(
  "/admin/indicadores",
  requiereRol("ADMIN"),
  ah(async (req, res) => {
    const q = esquemaIndicadores.parse(req.query);
    if (!esFechaValida(q.desde) || !esFechaValida(q.hasta)) throw new ErrorNegocio("RANGO_INVALIDO", "Fechas inválidas.", 422);
    res.json(await indicadores(q.desde, q.hasta));
  }),
);

// Pagos: ver (ADMIN) y operar (ADMIN con perfil autorizado + auditoría)
rutasStaff.get(
  "/admin/pagos",
  requiereRol("ADMIN"),
  ah(async (_req, res) => res.json(await repoPagos.listarPagos(getPool()))),
);

rutasStaff.post(
  "/admin/pagos",
  requiereRol("ADMIN"),
  requierePerfilPagos,
  ah(async (req, res) => {
    const d = esquemaPagoManual.parse(req.body);
    res.status(201).json({ resultado: await registrarPagoManual(d.id_cita, req.sesion!.sub) });
  }),
);

rutasStaff.post(
  "/admin/pagos/:id/revertir",
  requiereRol("ADMIN"),
  requierePerfilPagos,
  ah(async (req, res) => {
    const { id } = esquemaId.parse(req.params);
    res.json(await revertirPago(id, req.sesion!.sub));
  }),
);

rutasStaff.get(
  "/admin/auditoria",
  requiereRol("ADMIN"),
  ah(async (_req, res) => res.json(await listarAuditoria(getPool()))),
);
