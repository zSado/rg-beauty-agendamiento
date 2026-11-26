import { randomUUID } from "node:crypto";
import { Router } from "express";
import { portafolioDisponible, repoPortafolio, type Portafolio } from "../repositories/portafolio.js";
import { ah, autenticar, requiereRol } from "../security/middleware.js";
import { ErrorNegocio, NoEncontrado, Prohibido } from "../util/errores.js";
import { esquemaPortafolio, esquemaPortafolioCambios } from "./esquemas.js";

// Gestionar portafolio: profesional (solo el propio) y administración (todos) - matriz de roles
export const rutasPortafolioGestion = Router();
rutasPortafolioGestion.use(autenticar, requiereRol("PROFESIONAL", "ADMIN"));
rutasPortafolioGestion.use((_req, _res, next) => {
  if (!portafolioDisponible()) {
    return next(new ErrorNegocio("PORTAFOLIO_NO_DISPONIBLE", "El portafolio no está disponible por ahora.", 503));
  }
  next();
});

rutasPortafolioGestion.get(
  "/",
  ah(async (req, res) => {
    const s = req.sesion!;
    res.json(await repoPortafolio().listar({ id_profesional: s.rol === "PROFESIONAL" ? (s.idp ?? -1) : undefined }));
  }),
);

rutasPortafolioGestion.post(
  "/",
  ah(async (req, res) => {
    const d = esquemaPortafolio.parse(req.body);
    const s = req.sesion!;
    const idProfesional = s.rol === "PROFESIONAL" ? s.idp : d.id_profesional;
    if (!idProfesional) throw new ErrorNegocio("DATOS_INVALIDOS", "Indica el profesional.", 422);
    const doc: Portafolio = { ...d, _id: `port-${randomUUID().slice(0, 8)}`, id_profesional: idProfesional };
    await repoPortafolio().crear(doc);
    res.status(201).json(doc);
  }),
);

rutasPortafolioGestion.put(
  "/:id",
  ah(async (req, res) => {
    const s = req.sesion!;
    const actual = await repoPortafolio().obtener(String(req.params.id));
    if (!actual) throw new NoEncontrado();
    if (s.rol === "PROFESIONAL" && actual.id_profesional !== s.idp) throw new Prohibido();
    const cambios = esquemaPortafolioCambios.parse(req.body);
    if (s.rol === "PROFESIONAL") delete cambios.id_profesional; // no puede reasignarlo
    await repoPortafolio().actualizar(actual._id, cambios);
    res.json(await repoPortafolio().obtener(actual._id));
  }),
);

rutasPortafolioGestion.delete(
  "/:id",
  ah(async (req, res) => {
    const s = req.sesion!;
    const actual = await repoPortafolio().obtener(String(req.params.id));
    if (!actual) throw new NoEncontrado();
    if (s.rol === "PROFESIONAL" && actual.id_profesional !== s.idp) throw new Prohibido();
    await repoPortafolio().eliminar(actual._id);
    res.status(204).end();
  }),
);
