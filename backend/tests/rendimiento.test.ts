import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it } from "vitest";
import { getPool } from "../src/db/pg.js";
import { horasDisponibles } from "../src/services/agenda.js";
import { sumarDias } from "../src/util/fechas.js";
import { cerrarPool, prepararDemo } from "./helpers.js";

afterAll(cerrarPool);

// PR-01: volumen del informe (7.300 citas, 5 profesionales, 365 días, 1.000 consultas)
describe("PR-01 rendimiento de la búsqueda de horas disponibles", () => {
  it("p95 bajo 100 ms con el volumen anual estimado", async () => {
    const { ids, martes } = await prepararDemo();
    const cx = getPool();
    await cx.query("DELETE FROM pago");
    await cx.query("DELETE FROM cita");

    const profs: number[] = [ids.profesionales.a, ids.profesionales.b];
    for (let i = 3; i <= 5; i++) {
      const id = (await cx.query("INSERT INTO profesional (nombre, especialidad) VALUES ($1,'Prueba de carga') RETURNING id_profesional", [`Profesional ${i} (ficticia)`])).rows[0].id_profesional;
      await cx.query("INSERT INTO profesional_servicio VALUES ($1,$2)", [id, ids.servicios.manicure]);
      await cx.query("INSERT INTO disponibilidad (id_profesional, dia_semana, hora_inicio, hora_fin) SELECT $1, d, '09:00', '19:00' FROM generate_series(0,6) d", [id]);
      profs.push(id);
    }
    await cx.query("INSERT INTO profesional_servicio VALUES ($1,$2) ON CONFLICT DO NOTHING", [ids.profesionales.b, ids.servicios.manicure]);
    await cx.query("INSERT INTO disponibilidad (id_profesional, dia_semana, hora_inicio, hora_fin) SELECT $1, 0, '09:00', '19:00' ON CONFLICT DO NOTHING", [ids.profesionales.a]);

    await cx.query(
      `INSERT INTO cita (id_cliente,id_servicio,id_profesional,fecha_hora,fecha_hora_fin,estado,monto_abono)
       SELECT $1, $2, p, ($4::date + g) + h * interval '1 hour', ($4::date + g) + (h + 1) * interval '1 hour', 'CONFIRMADA', 6000
         FROM unnest($3::int[]) p, generate_series(0, 364) g, unnest(array[10,11,12,15]) h`,
      [ids.clientas.camila, ids.servicios.manicure, profs, martes],
    );
    const total = (await cx.query("SELECT count(*)::int n FROM cita")).rows[0].n;
    expect(total).toBe(7300);

    const tiempos: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const prof = profs[Math.floor(Math.random() * profs.length)]!;
      const fecha = sumarDias(martes, Math.floor(Math.random() * 365));
      const t0 = performance.now();
      await horasDisponibles({ idProfesional: prof, idServicio: ids.servicios.manicure, fecha });
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((a, b) => a - b);
    const pct = (p: number) => tiempos[Math.min(tiempos.length - 1, Math.floor((p / 100) * tiempos.length))]!;
    const prom = tiempos.reduce((s, x) => s + x, 0) / tiempos.length;
    const f = (n: number) => n.toFixed(3);
    console.log(`PR-01 | citas ${total} | consultas 1000 | promedio ${f(prom)} ms | p50 ${f(pct(50))} | p95 ${f(pct(95))} | p99 ${f(pct(99))} | max ${f(tiempos[tiempos.length - 1]!)}`);
    expect(pct(95)).toBeLessThan(100);
  });
});
