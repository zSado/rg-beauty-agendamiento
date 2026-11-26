// Aplica el esquema. Usa DATABASE_ADMIN_URL (con permiso de crear tablas); si no existe, DATABASE_URL.
// El usuario de la API (DATABASE_URL) solo necesita leer y escribir datos.
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_ADMIN_URL o DATABASE_URL en el archivo .env");
  process.exit(1);
}
const reset = process.argv.includes("--reset");
if (reset && process.env.NODE_ENV === "production") {
  console.error("--reset está prohibido en producción");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "sql");
const cx = new pg.Client({ connectionString: url });
await cx.connect();
try {
  if (reset) {
    await cx.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    console.log("Esquema anterior eliminado.");
  }
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await cx.query(readFileSync(join(dir, f), "utf8"));
    console.log(`Aplicado: ${f}`);
  }
  console.log("Migración lista.");
} finally {
  await cx.end();
}
