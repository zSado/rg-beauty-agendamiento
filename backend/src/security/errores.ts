import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ErrorNegocio } from "../util/errores.js";
import { log } from "../util/log.js";

/**
 * Manejo de errores (sección 7.3): la usuaria ve un mensaje claro y, si es un fallo interno,
 * un código de referencia. El detalle técnico queda solo en el registro del servidor.
 */
export const manejarErrores: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ErrorNegocio) {
    return void res.status(err.estadoHttp).json({ error: { codigo: err.codigo, mensaje: err.message } });
  }
  if (err instanceof ZodError) {
    const campos: Record<string, string> = {};
    for (const i of err.issues) campos[i.path.join(".") || "_"] ??= i.message;
    return void res
      .status(422)
      .json({ error: { codigo: "DATOS_INVALIDOS", mensaje: "Revisa los datos ingresados.", campos } });
  }
  if ((err as { type?: string }).type === "entity.parse.failed" || err instanceof SyntaxError) {
    return void res.status(400).json({ error: { codigo: "SOLICITUD_INVALIDA", mensaje: "La solicitud no es válida." } });
  }
  const ref = randomUUID().slice(0, 8);
  log.error("Error interno", { ref, ruta: req.path, metodo: req.method, detalle: String((err as Error)?.stack ?? err) });
  res.status(500).json({ error: { codigo: "ERROR_INTERNO", mensaje: `No pudimos completar la operación. Código ${ref}` } });
};
