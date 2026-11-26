import { getPool, transaccion } from "../db/pg.js";
import * as repo from "../repositories/usuarios.js";
import { hashearClave, hashFalso, verificarClave } from "../security/claves.js";
import { firmarAcceso, hashToken, nuevoTokenRenovacion, RENOVACION_DIAS, type SesionToken } from "../security/tokens.js";
import { ErrorNegocio, NoAutenticado } from "../util/errores.js";

const MAX_INTENTOS = 5; // A6: bloqueo temporal tras 5 intentos fallidos
const BLOQUEO_MINUTOS = 15;

export interface ParTokens {
  acceso: string;
  renovacion: string;
  usuario: { id_usuario: number; rol: repo.Rol; nombre: string | null };
}

async function emitir(u: repo.Usuario): Promise<ParTokens> {
  const sesion: SesionToken = { sub: u.id_usuario, rol: u.rol, idc: u.id_cliente, idp: u.id_profesional };
  const r = nuevoTokenRenovacion();
  await repo.crearSesion(getPool(), u.id_usuario, r.hash, RENOVACION_DIAS);
  let nombre: string | null = null;
  if (u.id_cliente) nombre = (await repo.obtenerCliente(getPool(), u.id_cliente))?.nombre ?? null;
  return { acceso: firmarAcceso(sesion), renovacion: r.token, usuario: { id_usuario: u.id_usuario, rol: u.rol, nombre } };
}

export async function registrarClienta(d: { nombre: string; correo: string; telefono: string; clave: string }) {
  const hash = await hashearClave(d.clave);
  let usuario: repo.Usuario;
  try {
    usuario = await transaccion(async (cx) => {
      const idCliente = await repo.crearCliente(cx, { nombre: d.nombre, correo: d.correo, telefono: d.telefono });
      const id = await repo.crearUsuario(cx, { correo: d.correo, clave_hash: hash, rol: "CLIENTA", id_cliente: idCliente });
      return (await repo.obtenerUsuario(cx, id))!;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      throw new ErrorNegocio("CORREO_EN_USO", "Ya existe una cuenta con ese correo. Inicia sesión.", 409);
    }
    throw e;
  }
  return emitir(usuario);
}

/** A1: el error es siempre genérico, exista o no el correo. */
export async function iniciarSesion(correo: string, clave: string): Promise<ParTokens> {
  const cx = getPool();
  const u = await repo.obtenerUsuarioPorCorreo(cx, correo);
  if (!u) {
    await verificarClave(await hashFalso(), clave); // mismo costo de tiempo
    throw new NoAutenticado("Correo o contraseña incorrectos.");
  }
  if (u.bloqueado_hasta && u.bloqueado_hasta.getTime() > Date.now()) {
    throw new ErrorNegocio("CUENTA_BLOQUEADA", "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", 423);
  }
  if (!(await verificarClave(u.clave_hash, clave))) {
    await repo.registrarFallo(cx, u.id_usuario, MAX_INTENTOS, BLOQUEO_MINUTOS);
    throw new NoAutenticado("Correo o contraseña incorrectos.");
  }
  await repo.limpiarFallos(cx, u.id_usuario);
  if (u.rol === "ADMIN") await repo.registrarAuditoria(cx, u.id_usuario, "INICIO_SESION_ADMIN");
  return emitir(u);
}

/** Token de renovación rotativo: cada uso entrega uno nuevo e invalida el anterior. */
export async function renovar(tokenRenovacion: string): Promise<ParTokens> {
  const cx = getPool();
  const idUsuario = await repo.consumirSesion(cx, hashToken(tokenRenovacion));
  if (!idUsuario) throw new NoAutenticado("Tu sesión venció. Inicia sesión de nuevo.");
  const u = await repo.obtenerUsuario(cx, idUsuario);
  if (!u) throw new NoAutenticado();
  return emitir(u);
}

export async function cerrarSesion(tokenRenovacion: string | undefined) {
  if (tokenRenovacion) await repo.revocarSesion(getPool(), hashToken(tokenRenovacion));
}
