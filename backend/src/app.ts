import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { manejarErrores } from "./security/errores.js";
import { csrf } from "./security/middleware.js";
import { rutasAuth } from "./routes/auth.js";
import { rutasCitas } from "./routes/citas.js";
import { rutasPagos, rutaWebhook } from "./routes/pagos.js";
import { publicas } from "./routes/publicas.js";
import { rutasPortafolioGestion } from "./routes/portafolioGestion.js";
import { rutasAdmin } from "./routes/admin.js";
import { rutasStaff } from "./routes/staff.js";

export function crearApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Encabezados de seguridad, incluida una política de contenido (A7)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => process.env.NODE_ENV === "test",
    }),
  );

  // El webhook necesita el cuerpo sin procesar (firma HMAC): su parser va en su propia ruta.
  app.use("/api/pagos", rutaWebhook);

  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());
  app.use("/api", csrf);
  app.use("/api/pagos", rutasPagos);

  app.use("/api", publicas);
  app.use("/api/auth", rutasAuth);
  app.use("/api/citas", rutasCitas);
  app.use("/api/portafolio/gestion", rutasPortafolioGestion);
  app.use("/api", rutasAdmin);
  app.use("/api", rutasStaff);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos lo que buscas." } });
  });
  app.use(manejarErrores);

  // Producción en un solo proceso: la API sirve también el frontend compilado
  if (env.FRONTEND_DIST && existsSync(resolve(env.FRONTEND_DIST, "index.html"))) {
    const dist = resolve(env.FRONTEND_DIST);
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
  }
  return app;
}
