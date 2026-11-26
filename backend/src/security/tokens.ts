import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { Rol } from "../repositories/usuarios.js";

export const ACCESO_MINUTOS = 15;
export const RENOVACION_DIAS = 7;

export interface SesionToken {
  sub: number; // id_usuario
  rol: Rol;
  idc: number | null; // id_cliente (se toma de aquí, nunca del cuerpo de la solicitud)
  idp: number | null; // id_profesional
}

export function firmarAcceso(s: SesionToken): string {
  return jwt.sign({ rol: s.rol, idc: s.idc, idp: s.idp }, env.JWT_SECRET, {
    subject: String(s.sub),
    expiresIn: `${ACCESO_MINUTOS}m`,
    algorithm: "HS256",
  });
}

export function verificarAcceso(token: string): SesionToken | undefined {
  try {
    const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    return { sub: Number(p.sub), rol: p.rol, idc: p.idc ?? null, idp: p.idp ?? null };
  } catch {
    return undefined;
  }
}

export function nuevoTokenRenovacion(): { token: string; hash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
