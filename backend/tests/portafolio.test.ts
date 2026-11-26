import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CORREOS, PORTAFOLIO_DEMO } from "../src/db/datosDemo.js";
import { RepoPortafolioMemoria, usarRepoPortafolio } from "../src/repositories/portafolio.js";
import { cerrarPool, navegador, prepararDemo } from "./helpers.js";

let repo: RepoPortafolioMemoria;

beforeAll(async () => {
  await prepararDemo();
});
beforeEach(async () => {
  repo = new RepoPortafolioMemoria();
  for (const d of PORTAFOLIO_DEMO) await repo.crear(structuredClone(d) as never);
  usarRepoPortafolio(repo);
});
afterAll(async () => {
  usarRepoPortafolio(undefined);
  await cerrarPool();
});

describe("Colección portafolio (no relacional)", () => {
  it("consulta 1 del informe: publicados con etiqueta facial o manicure", async () => {
    const r = await repo.listar({ publicado: true, etiquetas: ["facial", "manicure"] });
    expect(r.map((d) => d._id)).toEqual(["port-001", "port-002"]);
  });
  it("consulta 2 del informe: portafolio publicado del profesional 2", async () => {
    const r = await repo.listar({ id_profesional: 2, publicado: true });
    expect(r.map((d) => d._id)).toEqual(["port-002"]);
  });
  it("cada documento guarda solo los metadatos que tiene (esquema flexible)", async () => {
    expect((await repo.obtener("port-001"))!.metadatos).toHaveProperty("producto");
    expect((await repo.obtener("port-002"))!.metadatos).toHaveProperty("tipo_piel");
    expect((await repo.obtener("port-003"))!.metadatos).not.toHaveProperty("producto");
  });
});

describe("API del portafolio", () => {
  it("público: solo ve los publicados y puede filtrar por etiqueta", async () => {
    const nav = await navegador();
    const todos = await nav.get("/api/portafolio");
    expect(todos.status).toBe(200);
    expect(todos.body.map((d: { _id: string }) => d._id)).toEqual(["port-001", "port-002"]);
    const facial = await nav.get("/api/portafolio?etiqueta=facial");
    expect(facial.body).toHaveLength(1);
  });

  it("el profesional crea solo a su nombre y no edita lo de otro; administración sí", async () => {
    const profA = await navegador();
    await profA.entrar(CORREOS.profA);
    const creado = await profA.post("/api/portafolio/gestion", {
      id_servicio: 1, id_profesional: 99, titulo: "Nuevo trabajo", publicado: true,
      imagenes: [{ url: "https://ejemplo.cl/a.jpg", alt: "Manos con esmalte" }],
    });
    expect(creado.status).toBe(201);
    const cualquiera = (await profA.get("/api/portafolio/gestion")).body.map((d: { id_profesional: number }) => d.id_profesional);
    expect(new Set(cualquiera).size).toBe(1); // solo ve los suyos
    expect(creado.body.id_profesional).not.toBe(99);

    expect((await profA.put("/api/portafolio/gestion/port-002", { titulo: "Intento ajeno" })).status).toBe(403);
    expect((await profA.del("/api/portafolio/gestion/port-002")).status).toBe(403);

    const admin = await navegador();
    await admin.entrar(CORREOS.admin);
    expect((await admin.put("/api/portafolio/gestion/port-002", { titulo: "Título corregido" })).body.titulo).toBe("Título corregido");
    expect((await admin.del("/api/portafolio/gestion/port-003")).status).toBe(204);
  });

  it("PS-06 rechaza imágenes con URL peligrosa y la clienta no gestiona portafolio", async () => {
    const profA = await navegador();
    await profA.entrar(CORREOS.profA);
    const r = await profA.post("/api/portafolio/gestion", {
      id_servicio: 1, titulo: "Con imagen mala",
      imagenes: [{ url: "javascript:alert(1)", alt: "Descripción" }],
    });
    expect(r.status).toBe(422);
    const clienta = await navegador();
    await clienta.entrar(CORREOS.camila);
    expect((await clienta.post("/api/portafolio/gestion", { id_servicio: 1, titulo: "No debería" })).status).toBe(403);
  });
});
