import type { Consultable } from "./pg.js";
import { hashearClave } from "../security/claves.js";
import { crearCliente, crearUsuario } from "../repositories/usuarios.js";
import { diaSemana, sumarDias } from "../util/fechas.js";

// DATOS FICTICIOS para pruebas y demostración (la pauta exige no usar datos reales de clientas).
// Las contraseñas no están en el código: se entregan al ejecutar (variable SEED_PASSWORD).

export interface IdsDemo {
  clientas: { camila: number; valentina: number; daniela: number };
  profesionales: { a: number; b: number };
  servicios: { manicure: number; facial: number; masaje: number };
}

export const CORREOS = {
  admin: "admin@rgbeauty.test",
  adminSinPagos: "consulta@rgbeauty.test",
  profA: "prof.a@rgbeauty.test",
  profB: "prof.b@rgbeauty.test",
  camila: "camila.soto@example.com",
  valentina: "vale.rojas@example.com",
  daniela: "dani.pino@example.com",
} as const;

/** Próxima fecha (AAAA-MM-DD) con ese día de semana, al menos `minDias` días hacia adelante. */
export function proximaFecha(diaSem: number, minDias = 7): string {
  const hoy = new Date().toISOString().slice(0, 10);
  let f = sumarDias(hoy, minDias);
  while (diaSemana(f) !== diaSem) f = sumarDias(f, 1);
  return f;
}

export async function cargarDatosDemo(cx: Consultable, passwordDemo: string): Promise<IdsDemo> {
  const q = async (sql: string, p: unknown[] = []) => (await cx.query(sql, p)).rows;

  const camila = await crearCliente(cx, { nombre: "Camila Soto (ficticia)", correo: CORREOS.camila, telefono: "+56911111111" });
  const valentina = await crearCliente(cx, { nombre: "Valentina Rojas (ficticia)", correo: CORREOS.valentina, telefono: "+56922222222" });
  const daniela = await crearCliente(cx, { nombre: "Daniela Pino (ficticia)", correo: CORREOS.daniela, telefono: "+56933333333" });

  const a = (await q("INSERT INTO profesional (nombre, especialidad) VALUES ('Profesional A (ficticia)','Manicure y pedicure') RETURNING id_profesional"))[0].id_profesional;
  const b = (await q("INSERT INTO profesional (nombre, especialidad) VALUES ('Profesional B (ficticia)','Masajes y faciales') RETURNING id_profesional"))[0].id_profesional;

  const servicio = async (n: string, precio: number, dur: number, pct: number) =>
    (await q("INSERT INTO servicio (nombre, precio, duracion_min, pct_abono) VALUES ($1,$2,$3,$4) RETURNING id_servicio", [n, precio, dur, pct]))[0].id_servicio as number;
  const manicure = await servicio("Manicure semipermanente", 30000, 60, 20);
  const facial = await servicio("Limpieza facial profunda", 45000, 75, 20);
  const masaje = await servicio("Masaje relajante", 40000, 60, 25);

  await q("INSERT INTO profesional_servicio VALUES ($1,$2),($3,$4),($3,$5)", [a, manicure, b, facial, masaje]);

  // Lunes a viernes 09-13 y 14-19; sábado 10-14
  for (const prof of [a, b]) {
    for (let dia = 1; dia <= 5; dia++) {
      await q("INSERT INTO disponibilidad (id_profesional, dia_semana, hora_inicio, hora_fin) VALUES ($1,$2,'09:00','13:00'),($1,$2,'14:00','19:00')", [prof, dia]);
    }
    await q("INSERT INTO disponibilidad (id_profesional, dia_semana, hora_inicio, hora_fin) VALUES ($1,6,'10:00','14:00')", [prof]);
  }

  const hash = await hashearClave(passwordDemo);
  await crearUsuario(cx, { correo: CORREOS.admin, clave_hash: hash, rol: "ADMIN", autorizado_pagos: true });
  await crearUsuario(cx, { correo: CORREOS.adminSinPagos, clave_hash: hash, rol: "ADMIN", autorizado_pagos: false });
  await crearUsuario(cx, { correo: CORREOS.profA, clave_hash: hash, rol: "PROFESIONAL", id_profesional: a });
  await crearUsuario(cx, { correo: CORREOS.profB, clave_hash: hash, rol: "PROFESIONAL", id_profesional: b });
  await crearUsuario(cx, { correo: CORREOS.camila, clave_hash: hash, rol: "CLIENTA", id_cliente: camila });
  await crearUsuario(cx, { correo: CORREOS.valentina, clave_hash: hash, rol: "CLIENTA", id_cliente: valentina });
  await crearUsuario(cx, { correo: CORREOS.daniela, clave_hash: hash, rol: "CLIENTA", id_cliente: daniela });

  return {
    clientas: { camila, valentina, daniela },
    profesionales: { a, b },
    servicios: { manicure, facial, masaje },
  };
}

/** Dos citas confirmadas de ejemplo (las mismas del informe de la Unidad II) en el próximo martes. */
export async function cargarCitasDemo(cx: Consultable, ids: IdsDemo): Promise<string> {
  const martes = proximaFecha(2, 7);
  const ins = async (cli: number, serv: number, prof: number, ini: string, fin: string, abono: number, ref: string) => {
    const id = (
      await cx.query(
        `INSERT INTO cita (id_cliente,id_servicio,id_profesional,fecha_hora,fecha_hora_fin,estado,monto_abono)
         VALUES ($1,$2,$3,$4,$5,'CONFIRMADA',$6) RETURNING id_cita`,
        [cli, serv, prof, `${martes} ${ini}`, `${martes} ${fin}`, abono],
      )
    ).rows[0].id_cita;
    await cx.query("INSERT INTO pago (id_cita, monto, estado, referencia_externa) VALUES ($1,$2,'APROBADO',$3)", [id, abono, ref]);
  };
  await ins(ids.clientas.camila, ids.servicios.manicure, ids.profesionales.a, "10:00", "11:00", 6000, "PSP-0001");
  await ins(ids.clientas.valentina, ids.servicios.facial, ids.profesionales.b, "10:00", "11:15", 9000, "PSP-0002");
  return martes;
}

export const PORTAFOLIO_DEMO = [
  {
    _id: "port-001", id_servicio: 1, id_profesional: 1,
    titulo: "Manicure semipermanente rosa pastel",
    descripcion: "Trabajo de manicure con esmalte semipermanente y diseño minimalista.",
    etiquetas: ["manicure", "semipermanente", "rosa"],
    imagenes: [
      { url: "https://ejemplo.cl/img/port-001-a.jpg", alt: "Manos con esmalte rosa pastel" },
      { url: "https://ejemplo.cl/img/port-001-b.jpg", alt: "Detalle de la terminación" },
    ],
    metadatos: { duracion_real_min: 55, producto: "Gel marca ficticia X" },
    publicado: true,
  },
  {
    _id: "port-002", id_servicio: 2, id_profesional: 2,
    titulo: "Limpieza facial profunda antes y después",
    descripcion: "Resultado de limpieza facial con extracción y mascarilla calmante.",
    etiquetas: ["facial", "limpieza", "antes-despues"],
    imagenes: [{ url: "https://ejemplo.cl/img/port-002-a.jpg", alt: "Rostro antes y después" }],
    metadatos: { tipo_piel: "mixta", sesiones: 1 },
    publicado: true,
  },
  {
    _id: "port-003", id_servicio: 3, id_profesional: 2,
    titulo: "Sala de masajes",
    descripcion: "Ambiente de la sala de masaje relajante.",
    etiquetas: ["masaje", "ambiente"],
    imagenes: [],
    metadatos: { aforo: 1 },
    publicado: false,
  },
];
