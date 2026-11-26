import { getPool, transaccion } from "../db/pg.js";
import * as catalogo from "../repositories/catalogo.js";
import { registrarAuditoria } from "../repositories/usuarios.js";
import { ErrorNegocio, NoEncontrado } from "../util/errores.js";

// CRUD de servicios y profesionales (solo administración). Toda operación queda en la auditoría.
// Integridad referencial: las claves foráneas de PostgreSQL impiden dejar citas huérfanas y estas
// reglas devuelven un mensaje claro en lugar de un error técnico.

const codigoPg = (e: unknown) => (e as { code?: string }).code;

// ---------------- Servicios ----------------

export async function crearServicio(d: catalogo.DatosServicio, idUsuario: number) {
  try {
    return await transaccion(async (cx) => {
      const s = await catalogo.crearServicio(cx, d);
      await registrarAuditoria(cx, idUsuario, "CREAR_SERVICIO", `id_servicio=${s.id_servicio}`);
      return s;
    });
  } catch (e) {
    if (codigoPg(e) === "23505") throw new ErrorNegocio("SERVICIO_DUPLICADO", "Ya existe un servicio con ese nombre.", 409);
    throw e;
  }
}

/** Cambiar el precio o el porcentaje NO modifica el abono de citas ya reservadas (se guarda en cada cita). */
export async function actualizarServicio(id: number, d: catalogo.DatosServicio, idUsuario: number) {
  try {
    return await transaccion(async (cx) => {
      const s = await catalogo.actualizarServicio(cx, id, d);
      if (!s) throw new NoEncontrado("No encontramos ese servicio.");
      await registrarAuditoria(cx, idUsuario, "EDITAR_SERVICIO", `id_servicio=${id}`);
      return s;
    });
  } catch (e) {
    if (codigoPg(e) === "23505") throw new ErrorNegocio("SERVICIO_DUPLICADO", "Ya existe un servicio con ese nombre.", 409);
    throw e;
  }
}

export async function eliminarServicio(id: number, idUsuario: number) {
  await transaccion(async (cx) => {
    if (!(await catalogo.obtenerServicio(cx, id))) throw new NoEncontrado("No encontramos ese servicio.");
    const n = await catalogo.contarCitasDeServicio(cx, id);
    if (n > 0) {
      throw new ErrorNegocio(
        "SERVICIO_EN_USO",
        `No se puede eliminar: tiene ${n} cita(s) asociada(s). Para dejar de ofrecerlo, quítalo de los profesionales.`,
        409,
      );
    }
    await catalogo.eliminarServicio(cx, id);
    await registrarAuditoria(cx, idUsuario, "ELIMINAR_SERVICIO", `id_servicio=${id}`);
  });
}

// ---------------- Profesionales ----------------

export async function crearProfesional(d: { nombre: string; especialidad: string; servicios: number[] }, idUsuario: number) {
  try {
    return await transaccion(async (cx) => {
      const id = await catalogo.crearProfesional(cx, d);
      await catalogo.reemplazarServiciosDeProfesional(cx, id, d.servicios);
      await registrarAuditoria(cx, idUsuario, "CREAR_PROFESIONAL", `id_profesional=${id}`);
      return { id_profesional: id, nombre: d.nombre, especialidad: d.especialidad, servicios: [...new Set(d.servicios)] };
    });
  } catch (e) {
    if (codigoPg(e) === "23503") throw new ErrorNegocio("SERVICIO_INEXISTENTE", "Alguno de los servicios elegidos no existe.", 422);
    throw e;
  }
}

export async function actualizarProfesional(
  id: number,
  d: { nombre: string; especialidad: string; servicios: number[] },
  idUsuario: number,
) {
  try {
    return await transaccion(async (cx) => {
      if (!(await catalogo.actualizarProfesional(cx, id, d))) throw new NoEncontrado("No encontramos a ese profesional.");
      await catalogo.reemplazarServiciosDeProfesional(cx, id, d.servicios);
      await registrarAuditoria(cx, idUsuario, "EDITAR_PROFESIONAL", `id_profesional=${id}`);
      return { id_profesional: id, nombre: d.nombre, especialidad: d.especialidad, servicios: [...new Set(d.servicios)] };
    });
  } catch (e) {
    if (codigoPg(e) === "23503") throw new ErrorNegocio("SERVICIO_INEXISTENTE", "Alguno de los servicios elegidos no existe.", 422);
    throw e;
  }
}

export async function eliminarProfesional(id: number, idUsuario: number) {
  await transaccion(async (cx) => {
    if (!(await catalogo.obtenerProfesional(cx, id))) throw new NoEncontrado("No encontramos a ese profesional.");
    const citas = await catalogo.contarCitasDeProfesional(cx, id);
    if (citas > 0) {
      throw new ErrorNegocio("PROFESIONAL_EN_USO", `No se puede eliminar: tiene ${citas} cita(s) en su historial. Quítale sus servicios para dejar de ofrecerlo.`, 409);
    }
    if ((await catalogo.contarUsuariosDeProfesional(cx, id)) > 0) {
      throw new ErrorNegocio("PROFESIONAL_CON_USUARIO", "No se puede eliminar: tiene una cuenta de acceso asociada.", 409);
    }
    await catalogo.eliminarProfesional(cx, id);
    await registrarAuditoria(cx, idUsuario, "ELIMINAR_PROFESIONAL", `id_profesional=${id}`);
  });
}

/** Horario semanal: reemplaza todas las ventanas. Valida que no se traslapen en el mismo día. */
export async function guardarHorarioSemanal(id: number, ventanas: catalogo.VentanaSemanal[], idUsuario: number) {
  for (const v of ventanas) {
    if (v.hasta <= v.desde) throw new ErrorNegocio("HORARIO_INVALIDO", "En cada tramo, la hora de término debe ser posterior a la de inicio.", 422);
  }
  const porDia = new Map<number, catalogo.VentanaSemanal[]>();
  for (const v of ventanas) (porDia.get(v.dia_semana) ?? porDia.set(v.dia_semana, []).get(v.dia_semana)!).push(v);
  for (const lista of porDia.values()) {
    const orden = [...lista].sort((a, b) => a.desde.localeCompare(b.desde));
    for (let i = 1; i < orden.length; i++) {
      if (orden[i]!.desde < orden[i - 1]!.hasta) {
        throw new ErrorNegocio("HORARIO_INVALIDO", "Hay tramos que se traslapan en el mismo día.", 422);
      }
    }
  }
  await transaccion(async (cx) => {
    if (!(await catalogo.obtenerProfesional(cx, id))) throw new NoEncontrado("No encontramos a ese profesional.");
    await catalogo.reemplazarVentanas(cx, id, ventanas);
    await registrarAuditoria(cx, idUsuario, "EDITAR_HORARIO_SEMANAL", `id_profesional=${id}`);
  });
  return catalogo.ventanasDeProfesional(getPool(), id);
}
