import { Router } from "express";
import { calcularAbono } from "../domain/abono.js";
import { getPool } from "../db/pg.js";
import { mongoConfigurado } from "../db/mongo.js";
import * as catalogo from "../repositories/catalogo.js";
import { portafolioDisponible, repoPortafolio } from "../repositories/portafolio.js";
import { horasDisponibles } from "../services/agenda.js";
import { ah } from "../security/middleware.js";
import { ErrorNegocio } from "../util/errores.js";
import { esquemaFiltroPortafolio, esquemaHoras } from "./esquemas.js";

export const publicas = Router();

publicas.get(
  "/salud",
  ah(async (_req, res) => {
    await getPool().query("SELECT 1");
    res.json({ estado: "ok", postgres: "ok", mongo: mongoConfigurado() ? "configurado" : "no configurado" });
  }),
);

// P1: servicios con el abono calculado por el servidor (RN-01)
publicas.get(
  "/servicios",
  ah(async (_req, res) => {
    const lista = await catalogo.listarServicios(getPool());
    res.json(lista.map((s) => ({ ...s, monto_abono: calcularAbono(s.precio, s.pct_abono), saldo: s.precio - calcularAbono(s.precio, s.pct_abono) })));
  }),
);

publicas.get(
  "/profesionales",
  ah(async (req, res) => {
    const id = req.query.id_servicio === undefined ? undefined : Number(req.query.id_servicio);
    if (id !== undefined && (!Number.isInteger(id) || id <= 0)) {
      throw new ErrorNegocio("DATOS_INVALIDOS", "Servicio inválido.", 422);
    }
    res.json(await catalogo.listarProfesionales(getPool(), id));
  }),
);

// P2: horas libres
publicas.get(
  "/horarios",
  ah(async (req, res) => {
    const q = esquemaHoras.parse(req.query);
    const horas = await horasDisponibles({ idProfesional: q.id_profesional, idServicio: q.id_servicio, fecha: q.fecha });
    res.json({ fecha: q.fecha, horas });
  }),
);

// Portafolio público (MongoDB): solo documentos publicados
publicas.get(
  "/portafolio",
  ah(async (req, res) => {
    if (!portafolioDisponible()) {
      throw new ErrorNegocio("PORTAFOLIO_NO_DISPONIBLE", "El portafolio no está disponible por ahora.", 503);
    }
    const q = esquemaFiltroPortafolio.parse(req.query);
    const docs = await repoPortafolio().listar({
      publicado: true,
      etiquetas: q.etiqueta ? [q.etiqueta] : undefined,
      id_servicio: q.id_servicio,
      id_profesional: q.id_profesional,
    });
    res.json(docs);
  }),
);
