import { crearApp } from "./app.js";
import { env } from "./config/env.js";
import { mongoConfigurado } from "./db/mongo.js";
import { cerrarPool, getPool } from "./db/pg.js";
import { PORTAFOLIO_DEMO } from "./db/datosDemo.js";
import { RepoPortafolioMemoria, repoPortafolio, usarRepoPortafolio } from "./repositories/portafolio.js";
import { expirarCitasVencidas } from "./services/agenda.js";
import { log } from "./util/log.js";

await getPool().query("SELECT 1"); // falla al iniciar si la base no responde

if (!mongoConfigurado() && process.env.PORTAFOLIO_EN_MEMORIA === "true") {
  // Solo para demostrar sin MongoDB: los datos viven en memoria y se pierden al reiniciar.
  if (env.NODE_ENV === "production") throw new Error("PORTAFOLIO_EN_MEMORIA no se permite en producción");
  const mem = new RepoPortafolioMemoria();
  for (const d of PORTAFOLIO_DEMO) await mem.crear(structuredClone(d) as never);
  usarRepoPortafolio(mem);
  log.warn("Portafolio en memoria (sin MongoDB): solo para demostración");
} else if (mongoConfigurado()) {
  try {
    await repoPortafolio().asegurarIndices();
  } catch (e) {
    log.warn("MongoDB no respondió: el portafolio no estará disponible", { detalle: String(e) });
  }
}

const app = crearApp();
const servidor = app.listen(env.PORT, () => log.info("API escuchando", { puerto: env.PORT }));

// RN-04: cada minuto libera las citas sin pago vencidas
const tarea = setInterval(() => {
  expirarCitasVencidas().catch((e) => log.error("Fallo al expirar citas", { detalle: String(e) }));
}, 60_000);

async function cerrar() {
  clearInterval(tarea);
  servidor.close();
  await cerrarPool();
  process.exit(0);
}
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
