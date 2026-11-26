import { z } from "zod";

// Validación en servidor con modelos tipados (tipo, largo y formato), aunque el frontend ya valide.
const entero = z.coerce.number().int().positive();

export const esquemaRegistro = z.object({
  nombre: z.string().trim().min(2, "Ingresa tu nombre").max(100, "Máximo 100 caracteres"),
  correo: z.string().trim().toLowerCase().email("Ingresa un correo válido").max(120),
  telefono: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,15}$/, "Ingresa un teléfono válido, por ejemplo +56 9 1234 5678"),
  clave: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(100),
});

export const esquemaLogin = z.object({
  correo: z.string().trim().toLowerCase().email("Ingresa un correo válido").max(120),
  clave: z.string().min(1, "Ingresa tu contraseña").max(100),
});

export const esquemaHoras = z.object({
  id_profesional: entero,
  id_servicio: entero,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

export const esquemaCita = z.object({
  id_servicio: entero,
  id_profesional: entero,
  fecha_hora: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, "Fecha y hora inválidas"),
  id_cliente: entero.optional(), // solo lo usa ADMIN en nombre de una clienta
});

export const esquemaId = z.object({ id: entero });

export const esquemaSimularPago = z.object({
  id_cita: entero,
  resultado: z.enum(["APROBADO", "RECHAZADO"]),
});

export const esquemaWebhook = z.object({
  referencia_externa: z.string().min(1).max(100),
  id_cita: entero,
  monto: z.number().int().positive(),
  estado: z.enum(["APROBADO", "RECHAZADO"]),
});

export const esquemaPagoManual = z.object({ id_cita: entero });

export const esquemaAgenda = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  id_profesional: entero.optional(),
});

export const esquemaBloqueo = z.object({
  id_profesional: entero.optional(),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, "Fecha y hora inválidas"),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, "Fecha y hora inválidas"),
  motivo: z.string().trim().max(200).optional(),
});

export const esquemaIndicadores = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

// A7 (XSS): se limita largo y formato; React además escapa la salida por defecto.
const urlHttps = z
  .string()
  .url("URL inválida")
  .max(300)
  .refine((u) => u.startsWith("https://"), "La imagen debe usar https");

export const esquemaPortafolio = z.object({
  id_servicio: entero,
  id_profesional: entero.optional(),
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().max(500).default(""),
  etiquetas: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]),
  imagenes: z
    .array(z.object({ url: urlHttps, alt: z.string().trim().min(3, "Describe la imagen").max(150) }))
    .max(8)
    .default([]),
  metadatos: z.record(z.string().max(40), z.union([z.string().max(100), z.number(), z.boolean()])).default({}),
  publicado: z.boolean().default(false),
});

export const esquemaPortafolioCambios = esquemaPortafolio.partial();

export const esquemaFiltroPortafolio = z.object({
  etiqueta: z.string().trim().toLowerCase().max(30).optional(),
  id_servicio: entero.optional(),
  id_profesional: entero.optional(),
});

// ---- CRUD de administración ----
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");

export const esquemaServicio = z.object({
  nombre: z.string().trim().min(2, "Ingresa el nombre").max(80, "Máximo 80 caracteres"),
  precio: z.number({ invalid_type_error: "El precio debe ser un número" }).int("Sin decimales").min(1, "Debe ser mayor que 0").max(1_000_000, "Máximo $1.000.000"),
  duracion_min: z.number({ invalid_type_error: "La duración debe ser un número" }).int("Sin decimales").min(5, "Mínimo 5 minutos").max(480, "Máximo 480 minutos"),
  pct_abono: z.number({ invalid_type_error: "El porcentaje debe ser un número" }).int("Sin decimales").min(0, "Entre 0 y 100").max(100, "Entre 0 y 100"),
});

export const esquemaProfesional = z.object({
  nombre: z.string().trim().min(2, "Ingresa el nombre").max(100),
  especialidad: z.string().trim().min(2, "Ingresa la especialidad").max(100),
  servicios: z.array(z.number().int().positive()).max(50).default([]),
});

export const esquemaHorarioSemanal = z.object({
  ventanas: z
    .array(
      z.object({
        dia_semana: z.number().int().min(0).max(6),
        desde: hhmm,
        hasta: hhmm,
      }),
    )
    .max(28),
});

export const esquemaReprogramar = z.object({
  fecha_hora: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, "Fecha y hora inválidas"),
});

export const esquemaReporte = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  estado: z.enum(["PENDIENTE_PAGO", "CONFIRMADA", "CANCELADA", "EXPIRADA"]).optional(),
  id_profesional: z.coerce.number().int().positive().optional(),
  id_servicio: z.coerce.number().int().positive().optional(),
});

export const esquemaPerfil = z.object({
  nombre: z.string().trim().min(2, "Ingresa tu nombre").max(100),
  telefono: z.string().trim().regex(/^\+?[0-9 ]{8,15}$/, "Ingresa un teléfono válido, por ejemplo +56 9 1234 5678"),
});

export const esquemaBloqueoCambios = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, "Fecha y hora inválidas"),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, "Fecha y hora inválidas"),
  motivo: z.string().trim().max(200).nullable().optional(),
});
