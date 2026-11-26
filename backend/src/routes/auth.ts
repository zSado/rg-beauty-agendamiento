import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getPool } from "../db/pg.js";
import * as repo from "../repositories/usuarios.js";
import { ah, autenticar, borrarCookiesSesion, COOKIE_RENOVACION, ponerCookiesSesion } from "../security/middleware.js";
import * as auth from "../services/auth.js";
import { ErrorNegocio, NoAutenticado, Prohibido } from "../util/errores.js";
import { esquemaLogin, esquemaPerfil, esquemaRegistro } from "./esquemas.js";

export const rutasAuth = Router();

// A6: límite de intentos por IP, además del bloqueo por cuenta
const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: { codigo: "DEMASIADOS_INTENTOS", mensaje: "Demasiados intentos. Espera unos minutos." } },
});

const publicarSesion = (res: import("express").Response, t: auth.ParTokens) => {
  ponerCookiesSesion(res, t.acceso, t.renovacion);
  return { id_usuario: t.usuario.id_usuario, rol: t.usuario.rol, nombre: t.usuario.nombre };
};

rutasAuth.post(
  "/registro",
  limiteLogin,
  ah(async (req, res) => {
    const d = esquemaRegistro.parse(req.body);
    res.status(201).json(publicarSesion(res, await auth.registrarClienta(d)));
  }),
);

rutasAuth.post(
  "/login",
  limiteLogin,
  ah(async (req, res) => {
    const d = esquemaLogin.parse(req.body);
    res.json(publicarSesion(res, await auth.iniciarSesion(d.correo, d.clave)));
  }),
);

rutasAuth.post(
  "/renovar",
  ah(async (req, res) => {
    const token = req.cookies?.[COOKIE_RENOVACION];
    if (!token) throw new NoAutenticado();
    res.json(publicarSesion(res, await auth.renovar(token)));
  }),
);

rutasAuth.post(
  "/salir",
  ah(async (req, res) => {
    await auth.cerrarSesion(req.cookies?.[COOKIE_RENOVACION]);
    borrarCookiesSesion(res);
    res.status(204).end();
  }),
);

// Quién soy (para que el frontend sepa el rol). Los datos salen del token, no de la solicitud.
rutasAuth.get(
  "/yo",
  autenticar,
  ah(async (req, res) => {
    const s = req.sesion!;
    const cliente = s.idc ? await repo.obtenerCliente(getPool(), s.idc) : undefined;
    res.json({ id_usuario: s.sub, rol: s.rol, id_profesional: s.idp, nombre: cliente?.nombre ?? null, correo: cliente?.correo ?? null, telefono: cliente?.telefono ?? null });
  }),
);

// Perfil de la clienta: actualizar sus datos y eliminar su cuenta (solo si nunca tuvo citas)
rutasAuth.put(
  "/yo",
  autenticar,
  ah(async (req, res) => {
    const s = req.sesion!;
    if (s.rol !== "CLIENTA" || !s.idc) throw new Prohibido();
    const d = esquemaPerfil.parse(req.body);
    const c = await repo.actualizarCliente(getPool(), s.idc, d);
    res.json({ id_usuario: s.sub, rol: s.rol, id_profesional: null, nombre: c?.nombre ?? null, correo: c?.correo ?? null, telefono: c?.telefono ?? null });
  }),
);

rutasAuth.delete(
  "/yo",
  autenticar,
  ah(async (req, res) => {
    const s = req.sesion!;
    if (s.rol !== "CLIENTA" || !s.idc) throw new Prohibido();
    if ((await repo.contarCitasDeCliente(getPool(), s.idc)) > 0) {
      throw new ErrorNegocio("CUENTA_CON_HISTORIAL", "Tu cuenta tiene citas en su historial, por eso no se puede eliminar. Si quieres cerrarla, escríbenos.", 409);
    }
    await repo.eliminarClienta(getPool(), s.sub, s.idc);
    borrarCookiesSesion(res);
    res.status(204).end();
  }),
);
