// Carga datos FICTICIOS: catálogo, usuarios de demostración, dos citas y (si hay MongoDB) el portafolio.
import { cargarCitasDemo, cargarDatosDemo, PORTAFOLIO_DEMO } from "../src/db/datosDemo.js";
import { mongoConfigurado, cerrarMongo, getMongoDb } from "../src/db/mongo.js";
import { cerrarPool, getPool } from "../src/db/pg.js";

const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10) {
  console.error("Define SEED_PASSWORD (mínimo 10 caracteres) en .env: es la contraseña de las cuentas de demostración.");
  process.exit(1);
}

const cx = getPool();
const { rows } = await cx.query("SELECT count(*)::int AS n FROM servicio");
if (rows[0].n > 0) {
  console.error("La base ya tiene datos. Para empezar de cero usa: npm run db:reset");
  process.exit(1);
}

const ids = await cargarDatosDemo(cx, password);
const martes = await cargarCitasDemo(cx, ids);
console.log(`PostgreSQL: datos ficticios cargados (citas de ejemplo el ${martes}).`);

if (mongoConfigurado()) {
  const col = (await getMongoDb()).collection("portafolio");
  await col.deleteMany({});
  await col.insertMany(PORTAFOLIO_DEMO as never[]);
  await col.createIndex({ publicado: 1, etiquetas: 1 });
  await col.createIndex({ id_profesional: 1, publicado: 1 });
  console.log(`MongoDB: ${PORTAFOLIO_DEMO.length} documentos de portafolio insertados.`);
} else {
  console.log("MongoDB no configurado (MONGO_URI vacía): se omitió el portafolio.");
}

await cerrarPool();
await cerrarMongo();
