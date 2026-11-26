import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CORREOS, type IdsDemo } from "../src/db/datosDemo.js";
import { getPool } from "../src/db/pg.js";
import { obtenerClientePorCorreo } from "../src/repositories/usuarios.js";
import { firmar } from "../src/services/pagos.js";
import { cerrarPool, CLAVE_DEMO, navegador, prepararDemo } from "./helpers.js";

let ids: IdsDemo;
let martes: string;
beforeEach(async () => {
  ({ ids, martes } = await prepararDemo());
});
afterAll(cerrarPool);

const idCitaDe = async (idProfesional: number) =>
  (await getPool().query("SELECT id_cita FROM cita WHERE id_profesional=$1 LIMIT 1", [idProfesional])).rows[0].id_cita as number;

describe("Autenticación y sesiones", () => {
  it("PS-01 inyección SQL: la consulta parametrizada devuelve 0 filas; la concatenada (demostración) es vulnerable", async () => {
    const malicioso = "x' OR '1'='1";
    expect(await obtenerClientePorCorreo(getPool(), malicioso)).toBeUndefined();
    // Demostración del riesgo (NO es código de la aplicación): la versión concatenada devuelve todo.
    const vulnerable = await getPool().query(`SELECT id_cliente FROM cliente WHERE correo = '${malicioso}'`);
    expect(vulnerable.rowCount).toBe(3);
    // En la API, además, la entrada ni siquiera pasa la validación de formato
    const nav = await navegador();
    const r = await nav.post("/api/auth/login", { correo: malicioso, clave: "cualquiera" });
    expect(r.status).toBe(422);
  });

  it("A1 el error de inicio de sesión es el mismo exista o no el correo", async () => {
    const nav = await navegador();
    const a = await nav.post("/api/auth/login", { correo: "no-existe@example.com", clave: "Clave-Incorrecta-1" });
    const b = await nav.post("/api/auth/login", { correo: CORREOS.camila, clave: "Clave-Incorrecta-1" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.mensaje).toBe(b.body.error.mensaje);
  });

  it("PS-03 fuerza bruta: tras 5 intentos fallidos la cuenta se bloquea aunque luego llegue la clave correcta", async () => {
    const nav = await navegador();
    for (let i = 0; i < 5; i++) {
      expect((await nav.post("/api/auth/login", { correo: CORREOS.daniela, clave: "Clave-Incorrecta-1" })).status).toBe(401);
    }
    const r = await nav.post("/api/auth/login", { correo: CORREOS.daniela, clave: CLAVE_DEMO });
    expect(r.status).toBe(423);
    expect(r.body.error.codigo).toBe("CUENTA_BLOQUEADA");
  });

  it("las cookies de sesión son HttpOnly y SameSite=Strict, y no hay datos sensibles en el cuerpo", async () => {
    const nav = await navegador();
    const r = await nav.entrar(CORREOS.camila);
    const cookies = (r.headers["set-cookie"] as unknown as string[]).filter((c) => c.startsWith("rg_acceso") || c.startsWith("rg_renovacion"));
    expect(cookies).toHaveLength(2);
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Strict/i);
    }
    expect(JSON.stringify(r.body)).not.toMatch(/clave|hash|token/i);
    // La clave se guarda con Argon2id
    const hash = (await getPool().query("SELECT clave_hash FROM usuario WHERE correo=$1", [CORREOS.camila])).rows[0].clave_hash;
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("el token de renovación rota: el anterior deja de servir", async () => {
    const nav = await navegador();
    const login = await nav.entrar(CORREOS.camila);
    const viejo = (login.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("rg_renovacion"))!.split(";")[0]!;
    expect((await nav.post("/api/auth/renovar")).status).toBe(200); // usa el vigente y lo rota
    const intento = await request(nav.app)
      .post("/api/auth/renovar")
      .set("Cookie", [viejo, `rg_csrf=${nav.csrf}`])
      .set("x-csrf-token", nav.csrf);
    expect(intento.status).toBe(401);
  });

  it("sin sesión no se accede a recursos protegidos (401)", async () => {
    const nav = await navegador();
    expect((await nav.get("/api/citas/mias")).status).toBe(401);
    expect((await nav.get("/api/admin/indicadores?desde=2026-01-01&hasta=2026-01-31")).status).toBe(401);
  });
});

describe("Cabeceras y CSRF", () => {
  it("PS-04 la política de contenido solo permite scripts propios y no se anuncia el framework", async () => {
    const nav = await navegador();
    const r = await nav.get("/api/salud");
    expect(r.headers["content-security-policy"]).toMatch(/script-src 'self'/);
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("PS-05 una operación que cambia estado sin token CSRF se rechaza", async () => {
    const nav = await navegador();
    await nav.entrar(CORREOS.camila);
    const sin = await nav.postSinCsrf("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` });
    expect(sin.status).toBe(403);
    const con = await nav.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` });
    expect(con.status).toBe(201);
  });
});

describe("Control de acceso por rol y propietario (A5, A12)", () => {
  it("PS-02 una clienta no ve la cita de otra (403); la dueña, el profesional asignado y administración sí", async () => {
    const idCita = await idCitaDe(ids.profesionales.a); // cita de Camila con Profesional A
    const valentina = await navegador();
    await valentina.entrar(CORREOS.valentina);
    expect((await valentina.get(`/api/citas/${idCita}`)).status).toBe(403);

    const camila = await navegador();
    await camila.entrar(CORREOS.camila);
    expect((await camila.get(`/api/citas/${idCita}`)).status).toBe(200);

    const profA = await navegador();
    await profA.entrar(CORREOS.profA);
    expect((await profA.get(`/api/citas/${idCita}`)).status).toBe(200);
    const profB = await navegador();
    await profB.entrar(CORREOS.profB);
    expect((await profB.get(`/api/citas/${idCita}`)).status).toBe(403);

    const admin = await navegador();
    await admin.entrar(CORREOS.admin);
    expect((await admin.get(`/api/citas/${idCita}`)).status).toBe(200);
  });

  it("la clienta no puede cancelar la cita de otra", async () => {
    const idCita = await idCitaDe(ids.profesionales.a);
    const valentina = await navegador();
    await valentina.entrar(CORREOS.valentina);
    expect((await valentina.post(`/api/citas/${idCita}/cancelar`)).status).toBe(403);
  });

  it("el profesional ve solo su agenda aunque pida la de otro", async () => {
    const profB = await navegador();
    await profB.entrar(CORREOS.profB);
    const r = await profB.get(`/api/agenda?fecha=${martes}&id_profesional=${ids.profesionales.a}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].id_profesional).toBe(ids.profesionales.b);
    const admin = await navegador();
    await admin.entrar(CORREOS.admin);
    expect((await admin.get(`/api/agenda?fecha=${martes}`)).body).toHaveLength(2);
  });

  it("matriz de roles: clienta y profesional no ven indicadores ni operan pagos", async () => {
    const idCita = await idCitaDe(ids.profesionales.a);
    for (const correo of [CORREOS.camila, CORREOS.profA]) {
      const n = await navegador();
      await n.entrar(correo);
      expect((await n.get(`/api/admin/indicadores?desde=${martes}&hasta=${martes}`)).status).toBe(403);
      expect((await n.post("/api/admin/pagos", { id_cita: idCita })).status).toBe(403);
      expect((await n.get("/api/admin/auditoria")).status).toBe(403);
    }
    const camila = await navegador();
    await camila.entrar(CORREOS.camila);
    expect((await camila.get(`/api/agenda?fecha=${martes}`)).status).toBe(403);
  });

  it("el profesional solo gestiona su propia disponibilidad", async () => {
    const admin = await navegador();
    await admin.entrar(CORREOS.admin);
    const deB = await admin.post("/api/bloqueos", { id_profesional: ids.profesionales.b, inicio: `${martes}T16:00`, fin: `${martes}T17:00`, motivo: "Capacitación" });
    expect(deB.status).toBe(201);

    const profA = await navegador();
    await profA.entrar(CORREOS.profA);
    expect((await profA.del(`/api/bloqueos/${deB.body.id_bloqueo}`)).status).toBe(403);
    // Aunque indique a otro profesional, el bloqueo queda a nombre del que está en sesión
    const propio = await profA.post("/api/bloqueos", { id_profesional: ids.profesionales.b, inicio: `${martes}T17:00`, fin: `${martes}T18:00` });
    expect(propio.body.id_profesional).toBe(ids.profesionales.a);
    expect((await profA.del(`/api/bloqueos/${propio.body.id_bloqueo}`)).status).toBe(204);
  });

  it("A3 bloquear un horario con citas activas avisa cuántas hay", async () => {
    const admin = await navegador();
    await admin.entrar(CORREOS.admin);
    const r = await admin.post("/api/bloqueos", { id_profesional: ids.profesionales.a, inicio: `${martes}T09:00`, fin: `${martes}T12:00` });
    expect(r.status).toBe(201);
    expect(r.body.citas_activas_en_bloqueo).toBe(1);
  });

  it("RN-06: solo el perfil autorizado registra o revierte pagos, y queda auditoría", async () => {
    const reserva = await navegador();
    await reserva.entrar(CORREOS.daniela);
    const cita = await reserva.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` });
    expect(cita.status).toBe(201);

    const sinPerfil = await navegador();
    await sinPerfil.entrar(CORREOS.adminSinPagos);
    expect((await sinPerfil.post("/api/admin/pagos", { id_cita: cita.body.id_cita })).status).toBe(403);

    const admin = await navegador();
    await admin.entrar(CORREOS.admin);
    const pago = await admin.post("/api/admin/pagos", { id_cita: cita.body.id_cita });
    expect(pago.status).toBe(201);
    expect(pago.body.resultado).toBe("PROCESADO");
    const lista = await admin.get("/api/admin/pagos");
    const idPago = lista.body[0].id_pago;
    expect((await sinPerfil.post(`/api/admin/pagos/${idPago}/revertir`)).status).toBe(403);
    expect((await admin.post(`/api/admin/pagos/${idPago}/revertir`)).status).toBe(200);
    const audit = await admin.get("/api/admin/auditoria");
    const acciones = (audit.body as { accion: string }[]).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(["REGISTRAR_PAGO_MANUAL", "REVERTIR_PAGO", "INICIO_SESION_ADMIN"]));
  });

  it("A4 indicadores por HTTP: administración los ve y no hay traslapes", async () => {
    const admin = await navegador();
    await admin.entrar(CORREOS.admin);
    const r = await admin.get(`/api/admin/indicadores?desde=${martes}&hasta=${martes}`);
    expect(r.status).toBe(200);
    expect(r.body.traslapes).toBe(0);
    expect(r.body.citas_confirmadas).toBe(2);
    expect((await admin.get("/api/admin/indicadores?desde=2026-13-01&hasta=2026-01-01")).status).toBe(422);
  });
});

describe("Webhook de la pasarela (A2, A3)", () => {
  async function citaPendiente() {
    const nav = await navegador();
    await nav.entrar(CORREOS.daniela);
    const r = await nav.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` });
    return r.body.id_cita as number;
  }
  const enviar = (app: Parameters<typeof request>[0], cuerpo: string, firma?: string) => {
    const r = request(app).post("/api/pagos/webhook").set("Content-Type", "application/json");
    if (firma !== undefined) r.set("x-firma", firma);
    return r.send(cuerpo);
  };

  it("PI-10 firma inválida o ausente: se rechaza (401) y no se registra el pago", async () => {
    const id = await citaPendiente();
    const nav = await navegador();
    const cuerpo = JSON.stringify({ referencia_externa: "PSP-7001", id_cita: id, monto: 6000, estado: "APROBADO" });
    expect((await enviar(nav.app, cuerpo)).status).toBe(401);
    expect((await enviar(nav.app, cuerpo, "00".repeat(32))).status).toBe(401);
    // Cuerpo alterado después de firmar
    const alterado = cuerpo.replace("6000", "1");
    expect((await enviar(nav.app, alterado, firmar(cuerpo))).status).toBe(401);
    expect((await getPool().query("SELECT count(*)::int n FROM pago WHERE referencia_externa='PSP-7001'")).rows[0].n).toBe(0);
  });

  it("firma válida confirma la cita; repetirla no duplica; monto distinto del abono se rechaza (422)", async () => {
    const id = await citaPendiente();
    const nav = await navegador();
    const cuerpo = JSON.stringify({ referencia_externa: "PSP-7002", id_cita: id, monto: 6000, estado: "APROBADO" });
    const a = await enviar(nav.app, cuerpo, firmar(cuerpo));
    expect(a.status).toBe(200);
    expect(a.body.resultado).toBe("PROCESADO");
    const b = await enviar(nav.app, cuerpo, firmar(cuerpo));
    expect(b.body.resultado).toBe("DUPLICADO_IGNORADO");

    const id2 = await (async () => {
      const n = await navegador();
      await n.entrar(CORREOS.valentina);
      return (await n.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T15:00` })).body.id_cita as number;
    })();
    const malo = JSON.stringify({ referencia_externa: "PSP-7003", id_cita: id2, monto: 100, estado: "APROBADO" });
    const r = await enviar(nav.app, malo, firmar(malo));
    expect(r.status).toBe(422);
    expect((await getPool().query("SELECT count(*)::int n FROM pago WHERE id_cita=$1", [id2])).rows[0].n).toBe(0);
  });
});

describe("Flujo completo de la clienta (HU-01, HU-02, HU-04)", () => {
  it("registro, horas, reserva, pago rechazado, reintento aprobado, mis citas y cancelación", async () => {
    const nav = await navegador();
    const reg = await nav.post("/api/auth/registro", { nombre: "Clienta Nueva (ficticia)", correo: "nueva@example.com", telefono: "+56 9 8888 7777", clave: "Otra-Clave-2026" });
    expect(reg.status).toBe(201);
    expect(reg.body.rol).toBe("CLIENTA");

    const servicios = await nav.get("/api/servicios");
    const manicure = servicios.body.find((s: { nombre: string }) => s.nombre.startsWith("Manicure"));
    expect(manicure.monto_abono).toBe(6000);
    expect(manicure.saldo).toBe(24000);

    const profs = await nav.get(`/api/profesionales?id_servicio=${ids.servicios.manicure}`);
    expect(profs.body).toHaveLength(1);

    const horas = await nav.get(`/api/horarios?id_profesional=${ids.profesionales.a}&id_servicio=${ids.servicios.manicure}&fecha=${martes}`);
    expect(horas.body.horas).toContain("12:00");

    const yo = await obtenerClientePorCorreo(getPool(), "nueva@example.com");
    // Intenta reservar "a nombre de" otra clienta: el id del cuerpo se ignora, vale el del token
    const cita = await nav.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00`, id_cliente: ids.clientas.camila });
    expect(cita.status).toBe(201);
    expect(cita.body.id_cliente).toBe(yo!.id_cliente);

    // E1: otra clienta intenta el mismo horario
    const otra = await navegador();
    await otra.entrar(CORREOS.daniela);
    const choque = await otra.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` });
    expect(choque.status).toBe(409);
    expect(choque.body.error.codigo).toBe("HORARIO_NO_DISPONIBLE");

    // E2: pago rechazado, luego aprobado. La clienta no puede imponer el monto.
    const rechazo = await nav.post("/api/pagos/simular", { id_cita: cita.body.id_cita, resultado: "RECHAZADO", monto: 1 });
    expect(rechazo.body.resultado).toBe("RECHAZO_REGISTRADO");
    const ok = await nav.post("/api/pagos/simular", { id_cita: cita.body.id_cita, resultado: "APROBADO", monto: 1 });
    expect(ok.body.resultado).toBe("PROCESADO");

    const mias = await nav.get("/api/citas/mias");
    expect(mias.body).toHaveLength(1);
    expect(mias.body[0]).toMatchObject({ estado: "CONFIRMADA", pagado: 6000, monto_abono: 6000 });

    const cancel = await nav.post(`/api/citas/${cita.body.id_cita}/cancelar`);
    expect(cancel.body.estado).toBe("CANCELADA");
    const libres = await nav.get(`/api/horarios?id_profesional=${ids.profesionales.a}&id_servicio=${ids.servicios.manicure}&fecha=${martes}`);
    expect(libres.body.horas).toContain("12:00");
  });

  it("validación por campo con mensajes comprensibles (P3)", async () => {
    const nav = await navegador();
    const r = await nav.post("/api/auth/registro", { nombre: "", correo: "mal", telefono: "1", clave: "corta" });
    expect(r.status).toBe(422);
    expect(Object.keys(r.body.error.campos)).toEqual(expect.arrayContaining(["nombre", "correo", "telefono", "clave"]));
    const repetido = await nav.post("/api/auth/registro", { nombre: "Otra Persona", correo: CORREOS.camila, telefono: "+56911112222", clave: "Una-Clave-Larga-1" });
    expect(repetido.status).toBe(409);
  });

  it("los errores internos no filtran detalles técnicos", async () => {
    const nav = await navegador();
    const r = await nav.get("/api/horarios?id_profesional=abc&id_servicio=1&fecha=2026-11-10");
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).not.toMatch(/select|stack|pg|node_modules/i);
  });
});
