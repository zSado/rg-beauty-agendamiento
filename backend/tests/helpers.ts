import request from "supertest";
import { crearApp } from "../src/app.js";
import { cargarCitasDemo, cargarDatosDemo, type IdsDemo } from "../src/db/datosDemo.js";
import { cerrarPool, getPool } from "../src/db/pg.js";

export const CLAVE_DEMO = "Clave-De-Prueba-2026";

export async function limpiarBD() {
  const cx = getPool();
  for (const t of [
    "auditoria", "sesion", "pago", "cita", "bloqueo", "disponibilidad",
    "profesional_servicio", "usuario", "cliente", "servicio", "profesional",
  ]) {
    await cx.query(`DELETE FROM ${t}`);
  }
}

export async function prepararDemo(): Promise<{ ids: IdsDemo; martes: string }> {
  await limpiarBD();
  const ids = await cargarDatosDemo(getPool(), CLAVE_DEMO);
  const martes = await cargarCitasDemo(getPool(), ids);
  return { ids, martes };
}

export { cerrarPool };

/** Cliente HTTP con cookies y token CSRF, como lo haría el navegador. */
export async function navegador() {
  const app = crearApp();
  const agente = request.agent(app);
  const inicial = await agente.get("/api/salud");
  const cookies = (inicial.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const csrf = /rg_csrf=([^;]+)/.exec(cookies.join(";"))?.[1] ?? "";
  return {
    app,
    csrf,
    get: (u: string) => agente.get(u),
    post: (u: string, cuerpo?: object) => agente.post(u).set("x-csrf-token", csrf).send(cuerpo ?? {}),
    postSinCsrf: (u: string, cuerpo?: object) => agente.post(u).send(cuerpo ?? {}),
    put: (u: string, cuerpo?: object) => agente.put(u).set("x-csrf-token", csrf).send(cuerpo ?? {}),
    del: (u: string) => agente.delete(u).set("x-csrf-token", csrf),
    async entrar(correo: string, clave = CLAVE_DEMO) {
      const r = await agente.post("/api/auth/login").set("x-csrf-token", csrf).send({ correo, clave });
      if (r.status !== 200) throw new Error(`No se pudo iniciar sesión (${r.status})`);
      return r;
    },
  };
}
