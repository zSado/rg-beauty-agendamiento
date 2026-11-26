import "dotenv/config";
import { z } from "zod";

// Todas las credenciales y secretos vienen de variables de entorno (sección 7.3).
// Si falta alguna obligatoria, la aplicación no inicia.
const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  MONGO_URI: z.string().optional(),
  MONGO_DB: z.string().default("rg_beauty"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  PASARELA_SECRET: z.string().min(16, "PASARELA_SECRET debe tener al menos 16 caracteres"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  RETENCION_MINUTOS: z.coerce.number().int().positive().default(15),
  // Carpeta con el frontend compilado (opcional). Si existe, la API también lo sirve.
  FRONTEND_DIST: z.string().optional(),
});

const r = esquema.safeParse(process.env);
if (!r.success) {
  const faltas = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
  throw new Error(`Configuración inválida. Revisa tu archivo .env:\n  ${faltas}`);
}

export const env = r.data;
