import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ErrorApi, post, type Cita } from "../api";
import { MensajeError, MensajeInfo, Pasos } from "../componentes/ui";
import { fechaLarga, pesos } from "../formato";
import { useReserva } from "../reserva";

/** P4 · Resumen y abono. Al pagar se crea la cita retenida por 15 minutos. */
export function Resumen() {
  const { r, set } = useReserva();
  const ir = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string>();

  const { servicio, profesional, fecha, hora } = r;
  if (!servicio || !profesional || !fecha || !hora) return <Navigate to="/" replace />;

  // Si ya había una reserva retenida y vigente (volvió atrás), no se crea otra
  const vigente = r.cita && r.venceEn && r.venceEn > Date.now() ? r.cita : undefined;

  async function pagar() {
    if (vigente) return ir(`/pago?cita=${vigente.id_cita}`);
    setError(undefined);
    setEnviando(true); // evita el doble envío
    try {
      const cita = await post<Cita>("/api/citas", {
        id_servicio: servicio!.id_servicio,
        id_profesional: profesional!.id_profesional,
        fecha_hora: `${fecha}T${hora}`,
      });
      set({ cita, venceEn: Date.now() + (cita.segundos_restantes ?? 0) * 1000 });
      ir(`/pago?cita=${cita.id_cita}`);
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === "HORARIO_NO_DISPONIBLE") {
        set({ hora: undefined });
        ir("/no-disponible");
      } else {
        setError(e instanceof ErrorApi ? e.message : "No pudimos reservar tu hora. Inténtalo de nuevo.");
        setEnviando(false);
      }
    }
  }

  return (
    <>
      <Pasos actual={4} />
      <h1>Revisa tu reserva</h1>
      <div className="dos-columnas">
        <section className="panel" aria-labelledby="t-res">
          <h2 id="t-res">Tu cita</h2>
          <dl className="resumen">
            <dt>Servicio</dt><dd>{servicio.nombre}</dd>
            <dt>Profesional</dt><dd>{profesional.nombre}</dd>
            <dt>Día</dt><dd>{fechaLarga(fecha)}</dd>
            <dt>Hora</dt><dd>{hora} ({servicio.duracion_min} min)</dd>
          </dl>
        </section>
        <section className="panel" aria-labelledby="t-abono">
          <h2 id="t-abono">Abono y saldo</h2>
          <dl className="resumen">
            <dt>Precio del servicio</dt><dd>{pesos(servicio.precio)}</dd>
            <dt>Abono a pagar ahora</dt><dd><strong>{pesos(servicio.monto_abono)}</strong></dd>
            <dt>Saldo a pagar en el local</dt><dd>{pesos(servicio.saldo)}</dd>
          </dl>
          <MensajeInfo>
            Tu cita queda confirmada cuando pagues el abono de {pesos(servicio.monto_abono)}. El saldo de {pesos(servicio.saldo)} se paga en el local.
            Mantendremos tu horario por 15 minutos desde que presiones “Pagar abono”.
          </MensajeInfo>
        </section>
      </div>
      {error && <MensajeError>{error}</MensajeError>}
      <div className="barra-accion">
        <button type="button" className="btn btn-secundario" onClick={() => ir("/horario")} disabled={enviando}>Cambiar horario</button>
        <button type="button" className="btn" onClick={() => void pagar()} disabled={enviando}>
          {enviando ? "Reservando tu hora…" : vigente ? "Ir a pagar" : "Pagar abono"}
        </button>
      </div>
    </>
  );
}
