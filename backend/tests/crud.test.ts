import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CORREOS, type IdsDemo } from "../src/db/datosDemo.js";
import { getPool } from "../src/db/pg.js";
import { cerrarPool, navegador, prepararDemo } from "./helpers.js";

let ids: IdsDemo;
let martes: string;
beforeEach(async () => {
  ({ ids, martes } = await prepararDemo());
});
afterAll(cerrarPool);

const admin = async () => { const n = await navegador(); await n.entrar(CORREOS.admin); return n; };
const clienta = async (c: string = CORREOS.camila) => { const n = await navegador(); await n.entrar(c); return n; };
const nuevoServ = { nombre: "Depilación facial", precio: 15000, duracion_min: 30, pct_abono: 20 };

describe("CRUD de servicios", () => {
  it("crea (201), aparece en el catálogo público, edita y elimina", async () => {
    const a = await admin();
    const c = await a.post("/api/admin/servicios", nuevoServ);
    expect(c.status).toBe(201);
    const id = c.body.id_servicio;
    expect((await a.get("/api/servicios")).body.some((s: { id_servicio: number }) => s.id_servicio === id)).toBe(true);
    const u = await a.put(`/api/admin/servicios/${id}`, { ...nuevoServ, precio: 18000 });
    expect(u.status).toBe(200);
    expect((await getPool().query("SELECT precio FROM servicio WHERE id_servicio=$1", [id])).rows[0].precio).toBe(18000);
    expect((await a.del(`/api/admin/servicios/${id}`)).status).toBe(204);
    expect((await getPool().query("SELECT 1 FROM servicio WHERE id_servicio=$1", [id])).rowCount).toBe(0);
  });
  it("valida datos (422) y rechaza nombre duplicado (409)", async () => {
    const a = await admin();
    expect((await a.post("/api/admin/servicios", { ...nuevoServ, precio: -5 })).status).toBe(422);
    expect((await a.post("/api/admin/servicios", { ...nuevoServ, pct_abono: 150 })).status).toBe(422);
    expect((await a.post("/api/admin/servicios", { ...nuevoServ, nombre: "" })).status).toBe(422);
    expect((await a.post("/api/admin/servicios", { ...nuevoServ, nombre: "Manicure semipermanente" })).status).toBe(409);
  });
  it("cambiar el precio no altera el abono de citas ya reservadas", async () => {
    const a = await admin();
    const antes = (await getPool().query("SELECT monto_abono FROM cita WHERE id_servicio=$1", [ids.servicios.manicure])).rows.map((r) => r.monto_abono);
    await a.put(`/api/admin/servicios/${ids.servicios.manicure}`, { nombre: "Manicure semipermanente", precio: 90000, duracion_min: 60, pct_abono: 50 });
    const despues = (await getPool().query("SELECT monto_abono FROM cita WHERE id_servicio=$1", [ids.servicios.manicure])).rows.map((r) => r.monto_abono);
    expect(despues).toEqual(antes);
  });
  it("no elimina un servicio con citas (409) y solo ADMIN puede gestionar (403/401)", async () => {
    const a = await admin();
    const r = await a.del(`/api/admin/servicios/${ids.servicios.manicure}`);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe("SERVICIO_EN_USO");
    expect((await (await clienta()).post("/api/admin/servicios", nuevoServ)).status).toBe(403);
    expect((await (await navegador()).get("/api/admin/profesionales")).status).toBe(401);
  });
});

describe("CRUD de profesionales y horario", () => {
  it("crea con servicios, edita, y se puede reservar en el horario que se le define", async () => {
    const a = await admin();
    const c = await a.post("/api/admin/profesionales", { nombre: "Profesional C (ficticia)", especialidad: "Uñas", servicios: [ids.servicios.manicure] });
    expect(c.status).toBe(201);
    const id = c.body.id_profesional;
    expect((await a.get("/api/admin/profesionales")).body.find((p: { id_profesional: number }) => p.id_profesional === id).servicios).toEqual([ids.servicios.manicure]);
    const h = await a.put(`/api/admin/profesionales/${id}/horario`, { ventanas: [{ dia_semana: 2, desde: "09:00", hasta: "13:00" }] });
    expect(h.status).toBe(200);
    expect((await a.get(`/api/admin/profesionales/${id}/horario`)).body).toHaveLength(1);
    const cam = await clienta();
    const r = await cam.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: id, fecha_hora: `${martes}T09:00` });
    expect(r.status).toBe(201);
    const e = await a.put(`/api/admin/profesionales/${id}`, { nombre: "Profesional C2", especialidad: "Uñas", servicios: [] });
    expect(e.status).toBe(200);
  });
  it("rechaza horarios inválidos o traslapados (422)", async () => {
    const a = await admin();
    const p = ids.profesionales.a;
    expect((await a.put(`/api/admin/profesionales/${p}/horario`, { ventanas: [{ dia_semana: 1, desde: "13:00", hasta: "09:00" }] })).status).toBe(422);
    expect((await a.put(`/api/admin/profesionales/${p}/horario`, { ventanas: [{ dia_semana: 1, desde: "09:00", hasta: "12:00" }, { dia_semana: 1, desde: "11:00", hasta: "14:00" }] })).status).toBe(422);
    expect((await a.put(`/api/admin/profesionales/${p}/horario`, { ventanas: [{ dia_semana: 9, desde: "09:00", hasta: "12:00" }] })).status).toBe(422);
    expect((await a.put(`/api/admin/profesionales/${p}/horario`, { ventanas: [{ dia_semana: 1, desde: "9am", hasta: "12:00" }] })).status).toBe(422);
  });
  it("no elimina profesionales con citas (409); sí uno sin uso (204)", async () => {
    const a = await admin();
    expect((await a.del(`/api/admin/profesionales/${ids.profesionales.a}`)).status).toBe(409);
    const c = await a.post("/api/admin/profesionales", { nombre: "Temporal", especialidad: "Prueba", servicios: [] });
    expect((await a.del(`/api/admin/profesionales/${c.body.id_profesional}`)).status).toBe(204);
    expect((await a.del(`/api/admin/profesionales/999999`)).status).toBe(404);
  });
});

describe("Reprogramar (UPDATE de cita)", () => {
  const reservar = async (n: Awaited<ReturnType<typeof clienta>>, hora = "12:00") =>
    (await n.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T${hora}` })).body.id_cita as number;

  it("mueve la cita, conserva estado y abono, y libera el horario anterior", async () => {
    const cam = await clienta();
    const id = await reservar(cam);
    const antes = (await getPool().query("SELECT monto_abono, estado FROM cita WHERE id_cita=$1", [id])).rows[0];
    const r = await cam.put(`/api/citas/${id}/reprogramar`, { fecha_hora: `${martes}T15:00` });
    expect(r.status).toBe(200);
    const d = (await getPool().query("SELECT monto_abono, estado, fecha_hora FROM cita WHERE id_cita=$1", [id])).rows[0];
    expect(d.monto_abono).toBe(antes.monto_abono);
    expect(d.estado).toBe(antes.estado);
    expect(String(d.fecha_hora)).toContain("15:00");
    // el horario viejo quedó libre
    const val = await clienta(CORREOS.valentina);
    expect((await val.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` })).status).toBe(201);
  });
  it("horario ocupado → 409 y la cita original no cambia", async () => {
    const cam = await clienta();
    const id = await reservar(cam);
    const r = await cam.put(`/api/citas/${id}/reprogramar`, { fecha_hora: `${martes}T10:30` });
    expect(r.status).toBe(409);
    expect(String((await getPool().query("SELECT fecha_hora FROM cita WHERE id_cita=$1", [id])).rows[0].fecha_hora)).toContain("12:00");
  });
  it("mismo horario → 422; otra clienta → 403; cancelada → 409; formato inválido → 422", async () => {
    const cam = await clienta();
    const id = await reservar(cam);
    expect((await cam.put(`/api/citas/${id}/reprogramar`, { fecha_hora: `${martes}T12:00` })).status).toBe(422);
    expect((await (await clienta(CORREOS.valentina)).put(`/api/citas/${id}/reprogramar`, { fecha_hora: `${martes}T16:00` })).status).toBe(403);
    expect((await cam.put(`/api/citas/${id}/reprogramar`, { fecha_hora: "mañana" })).status).toBe(422);
    await cam.post(`/api/citas/${id}/cancelar`);
    expect((await cam.put(`/api/citas/${id}/reprogramar`, { fecha_hora: `${martes}T16:00` })).status).toBe(409);
  });
});

describe("Eliminar cita (admin)", () => {
  it("elimina canceladas, no confirmadas, y solo ADMIN", async () => {
    const cam = await clienta();
    const id = (await cam.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` })).body.id_cita;
    const a = await admin();
    expect((await cam.del(`/api/admin/citas/${id}`)).status).toBe(403);
    expect((await a.del(`/api/admin/citas/${id}`)).status).toBe(409); // pendiente de pago
    await cam.post(`/api/citas/${id}/cancelar`);
    expect((await a.del(`/api/admin/citas/${id}`)).status).toBe(204);
    expect((await getPool().query("SELECT 1 FROM cita WHERE id_cita=$1", [id])).rowCount).toBe(0);
    const conf = (await getPool().query("SELECT id_cita FROM cita WHERE estado='CONFIRMADA' LIMIT 1")).rows[0].id_cita;
    expect((await a.del(`/api/admin/citas/${conf}`)).status).toBe(409);
  });
  it("no elimina canceladas con pago aprobado (queda el registro contable)", async () => {
    const conf = (await getPool().query("SELECT id_cita, monto_abono FROM cita WHERE estado='CONFIRMADA' LIMIT 1")).rows[0];
    await getPool().query("INSERT INTO pago (id_cita, monto, estado, referencia_externa) VALUES ($1,$2,'APROBADO','REF-TEST-1') ON CONFLICT DO NOTHING", [conf.id_cita, conf.monto_abono]);
    await getPool().query("UPDATE cita SET estado='CANCELADA' WHERE id_cita=$1", [conf.id_cita]);
    const r = await (await admin()).del(`/api/admin/citas/${conf.id_cita}`);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe("CITA_CON_PAGOS");
  });
});

describe("Reporte por rango de fechas", () => {
  it("devuelve filas reales y cambia con el rango y los filtros", async () => {
    const a = await admin();
    const amplio = await a.get(`/api/admin/reporte/citas?desde=${martes}&hasta=${martes}`);
    expect(amplio.status).toBe(200);
    expect(amplio.body.filas).toHaveLength(2);
    expect(amplio.body.totales.cantidad).toBe(2);
    const prof = await a.get(`/api/admin/reporte/citas?desde=${martes}&hasta=${martes}&id_profesional=${ids.profesionales.a}`);
    expect(prof.body.filas).toHaveLength(1);
    const vacio = await a.get(`/api/admin/reporte/citas?desde=2000-01-01&hasta=2000-01-31`);
    expect(vacio.body.filas).toHaveLength(0);
    // un dato nuevo aparece en el siguiente reporte (no son datos fijos)
    const cam = await clienta();
    await cam.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` });
    expect((await a.get(`/api/admin/reporte/citas?desde=${martes}&hasta=${martes}`)).body.filas).toHaveLength(3);
    expect((await a.get(`/api/admin/reporte/citas?desde=${martes}&hasta=${martes}&estado=PENDIENTE_PAGO`)).body.filas).toHaveLength(1);
  });
  it("rango inválido → 422; clienta → 403", async () => {
    const a = await admin();
    expect((await a.get("/api/admin/reporte/citas?desde=2026-12-10&hasta=2026-12-01")).status).toBe(422);
    expect((await a.get("/api/admin/reporte/citas?desde=2026-02-31&hasta=2026-03-01")).status).toBe(422);
    expect((await a.get("/api/admin/reporte/citas?desde=2020-01-01&hasta=2026-12-01")).status).toBe(422);
    expect((await a.get("/api/admin/reporte/citas?desde=abc&hasta=2026-12-01")).status).toBe(422);
    expect((await (await clienta()).get(`/api/admin/reporte/citas?desde=${martes}&hasta=${martes}`)).status).toBe(403);
  });
});

describe("Bloqueos y perfil", () => {
  it("el profesional edita su bloqueo pero no el de otro", async () => {
    const pa = await navegador(); await pa.entrar(CORREOS.profA);
    const pb = await navegador(); await pb.entrar(CORREOS.profB);
    const b = await pa.post("/api/bloqueos", { inicio: `${martes}T16:00`, fin: `${martes}T17:00`, motivo: "Trámite" });
    expect(b.status).toBe(201);
    const id = b.body.id_bloqueo;
    expect((await pa.put(`/api/bloqueos/${id}`, { inicio: `${martes}T16:00`, fin: `${martes}T18:00`, motivo: "Trámite largo" })).status).toBe(200);
    expect(String((await getPool().query("SELECT fin FROM bloqueo WHERE id_bloqueo=$1", [id])).rows[0].fin)).toContain("18:00");
    expect((await pb.put(`/api/bloqueos/${id}`, { inicio: `${martes}T16:00`, fin: `${martes}T18:00` })).status).toBe(403);
    expect((await pa.put(`/api/bloqueos/${id}`, { inicio: `${martes}T18:00`, fin: `${martes}T16:00` })).status).toBe(422);
  });
  it("la clienta actualiza su perfil y valida el teléfono", async () => {
    const cam = await clienta();
    expect((await cam.put("/api/auth/yo", { nombre: "Camila S.", telefono: "123" })).status).toBe(422);
    expect((await cam.put("/api/auth/yo", { nombre: "Camila S.", telefono: "+56 9 8888 7777" })).status).toBe(200);
    expect((await getPool().query("SELECT nombre FROM cliente WHERE id_cliente=$1", [ids.clientas.camila])).rows[0].nombre).toBe("Camila S.");
  });
  it("elimina su cuenta solo si nunca tuvo citas", async () => {
    const cam = await clienta();
    await cam.post("/api/citas", { id_servicio: ids.servicios.manicure, id_profesional: ids.profesionales.a, fecha_hora: `${martes}T12:00` });
    expect((await cam.del("/api/auth/yo")).status).toBe(409);
    const dani = await clienta(CORREOS.daniela);
    expect((await dani.del("/api/auth/yo")).status).toBe(204);
    expect((await getPool().query("SELECT 1 FROM cliente WHERE id_cliente=$1", [ids.clientas.daniela])).rowCount).toBe(0);
  });
});
