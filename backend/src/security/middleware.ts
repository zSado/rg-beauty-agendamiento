import { randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../config/env.js";
import { getPool } from "../db/pg.js";
import { obtenerUsuario, type Rol } from "../repositories/usuarios.js";
import { NoAutenticado, Prohibido } from "../util/errores.js";
import { ACCESO_MINUTOS, RENOVACION_DIAS, verificarAcceso } from "./tokens.js";

export const COOKIE_ACCESO = "rg_acceso";
export const COOKIE_RENOVACION = "rg_renovacion";
export const COOKIE_CSRF = "rg_csrf";

const base = (): CookieOptions => ({ secure: env.COOKIE_SECURE, sameSite: "strict" });

/** Sesión en cookies HttpOnly (el JavaScript de la página no puede leer los tokens: mitiga XSS). */
export function ponerCookiesSesion(res: Response, acceso: string, renovacion: string) {
  res.cookie(COOKIE_ACCESO, acceso, { ...base(), httpOnly: true, maxAge: ACCESO_MINUTOS * 60_000, path: "/" });
  res.cookie(COOKIE_RENOVACION, renovacion, {
    ...base(),
    httpOnly: true,
    maxAge: RENOVACION_DIAS * 86_400_000,
    path: "/api/auth",
  });
}

export function borrarCookiesSesion(res: Response) {
  res.clearCookie(COOKIE_ACCESO, { ...base(), path: "/" });
  res.clearCookie(COOKIE_RENOVACION, { ...base(), path: "/api/auth" });
}

/**
 * A8 (CSRF): token de doble envío. La cookie rg_csrf (legible por la página) debe coincidir con
 * el encabezado x-csrf-token en toda operación que cambia estado. Además las cookies son SameSite=Strict.
 * El webhook de la pasarela queda fuera porque no usa cookies: se protege con firma HMAC.
 */
export const csrf: RequestHandler = (req, res, next) => {
  if (!req.cookies?.[COOKIE_CSRF]) {
    res.cookie(COOKIE_CSRF, randomBytes(24).toString("base64url"), { ...base(), httpOnly: false, path: "/" });
  }
  const metodoSeguro = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (metodoSeguro || req.originalUrl.split("?")[0] === "/api/pagos/webhook") return next();

  const cookie = String(req.cookies?.[COOKIE_CSRF] ?? "");
  const cabecera = String(req.headers["x-csrf-token"] ?? "");
  const a = Buffer.from(cookie);
  const b = Buffer.from(cabecera);
  if (!cookie || a.length !== b.length || !timingSafeEqual(a, b)) {
    return next(new Prohibido("No pudimos verificar tu solicitud. Recarga la página e inténtalo de nuevo."));
  }
  next();
};

/** Identifica a la usuaria a partir de la cookie de acceso. */
export const autenticar: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[COOKIE_ACCESO];
  const sesion = token ? verificarAcceso(token) : undefined;
  if (!sesion) return next(new NoAutenticado());
  req.sesion = sesion;
  next();
};

/** Autorización por rol (mínimo privilegio, sección 7.1). */
export function requiereRol(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.sesion) return next(new NoAutenticado());
    if (!roles.includes(req.sesion.rol)) return next(new Prohibido());
    next();
  };
}

/** RN-06: registrar o revertir pagos solo lo hace administración con perfil autorizado (se consulta a la BD). */
export const requierePerfilPagos: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.sesion) return next(new NoAutenticado());
    const u = await obtenerUsuario(getPool(), req.sesion.sub);
    if (!u || u.rol !== "ADMIN" || !u.autorizado_pagos) return next(new Prohibido("Tu perfil no está autorizado para operar pagos."));
    next();
  } catch (e) {
    next(e);
  }
};

/** Envuelve controladores async para que sus errores lleguen al manejador de errores. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
