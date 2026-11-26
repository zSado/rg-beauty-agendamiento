import express, { Router } from "express";
import { getPool } from "../db/pg.js";
import * as citas from "../repositories/citas.js";
import { ah, autenticar, requiereRol } from "../security/middleware.js";
import { armarNotificacionSimulada, firmaValida, procesarNotificacionPago } from "../services/pagos.js";
import { ErrorNegocio, NoEncontrado, Prohibido } from "../util/errores.js";
import { log } from "../util/log.js";
import { esquemaSimularPago, esquemaWebhook } from "./esquemas.js";

export const rutaWebhook = Router();
export const rutasPagos = Router();

/**
 * Webhook de la pasarela (única entrada pública además de la web). Recibe el cuerpo SIN procesar
 * para poder verificar la firma HMAC sobre los bytes exactos. Firma inválida -> 401 y se registra.
 */
rutaWebhook.post(
  "/webhook",
  express.raw({ type: "application/json", limit: "10kb" }),
  ah(async (req, res) => {
    const cuerpo = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!firmaValida(cuerpo, req.header("x-firma"))) {
      log.warn("Webhook rechazado: firma inválida", { ip: req.ip });
      throw new ErrorNegocio("FIRMA_INVALIDA", "Firma inválida.", 401);
    }
    let json: unknown;
    try {
      json = JSON.parse(cuerpo);
    } catch {
      throw new ErrorNegocio("SOLICITUD_INVALIDA", "La solicitud no es válida.", 400);
    }
    const n = esquemaWebhook.parse(json);
    res.json({ resultado: await procesarNotificacionPago(n) });
  }),
);

/**
 * P5: PASARELA SIMULADA. En producción la clienta paga en la pasarela real (Flow o Webpay Plus)
 * y es esta la que llama al webhook. Aquí la clienta elige el resultado y el servidor genera la
 * misma notificación firmada y la procesa con el mismo código que el webhook real.
 * El monto lo fija el servidor (RN-01); la clienta no lo envía.
 */
rutasPagos.post(
  "/simular",
  autenticar,
  requiereRol("CLIENTA"),
  ah(async (req, res) => {
    const d = esquemaSimularPago.parse(req.body);
    const cita = await citas.obtenerCita(getPool(), d.id_cita);
    if (!cita) throw new NoEncontrado("No encontramos esa cita.");
    if (cita.id_cliente !== req.sesion!.idc) throw new Prohibido();
    const { cuerpo, firma } = armarNotificacionSimulada({ id_cita: cita.id_cita, monto: cita.monto_abono, resultado: d.resultado });
    if (!firmaValida(cuerpo, firma)) throw new ErrorNegocio("FIRMA_INVALIDA", "Firma inválida.", 401);
    const resultado = await procesarNotificacionPago(esquemaWebhook.parse(JSON.parse(cuerpo)));
    res.json({ resultado });
  }),
);
