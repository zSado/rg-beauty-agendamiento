import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorApi, get, post, type CitaDetalle } from "../api";
import { Cargando, MensajeError, MensajeInfo, Pasos } from "../componentes/ui";
import { fechaLarga, pesos, soloFecha, soloHora } from "../formato";
import { useReserva } from "../reserva";

function useCuentaRegresiva(segundosIniciales: number | null | undefined) {
  const [restante, setRestante] = useState<number | null>(null);
  const limite = useRef<number>();
  useEffect(() => {
    if (segundosIniciales == null) return;
    limite.current = Date.now() + segundosIniciales * 1000;
    const tic = () => setRestante(Math.max(0, Math.round(((limite.current ?? 0) - Date.now()) / 1000)));
    tic();
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, [segundosIniciales]);
  return restante;
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** P5 · Pago del abono (pasarela SIMULADA) */
export function Pago() {
  const [params] = useSearchParams();
  const idCita = Number(params.get("cita"));
  const ir = useNavigate();
  const { reiniciar } = useReserva();
  const [cita, setCita] = useState<CitaDetalle>();
  const [error, setError] = useState<string>();
  const [pagando, setPagando] = useState(false);
  const restante = useCuentaRegresiva(cita?.estado === "PENDIENTE_PAGO" ? cita.segundos_restantes : null);

  useEffect(() => {
    if (!idCita) return;
    get<CitaDetalle>(`/api/citas/${idCita}`)
      .then((c) => {
        if (c.estado === "CONFIRMADA") ir(`/confirmacion/${c.id_cita}`, { replace: true });
        else setCita(c);
      })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar tu reserva."));
  }, [idCita, ir]);

  if (!idCita) return <Navigate to="/" replace />;

  const vencida = cita && (cita.estado !== "PENDIENTE_PAGO" || restante === 0);

  async function simular(resultado: "APROBADO" | "RECHAZADO") {
    setError(undefined);
    setPagando(true); // evita el doble envío
    try {
      const r = await post<{ resultado: string }>("/api/pagos/simular", { id_cita: idCita, resultado });
      if (r.resultado === "RECHAZO_REGISTRADO") return ir(`/pago-rechazado?cita=${idCita}`);
      ir(`/confirmacion/${idCita}`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos procesar el pago.");
      setPagando(false);
    }
  }

  return (
    <>
      <Pasos actual={5} />
      <h1>Paga tu abono</h1>
      {error && !cita && <MensajeError>{error}</MensajeError>}
      {!cita && !error && <Cargando texto="Cargando tu reserva" />}
      {cita && (
        <div className="dos-columnas">
          <section className="panel" aria-labelledby="t-r">
            <h2 id="t-r">Tu reserva</h2>
            <dl className="resumen">
              <dt>Servicio</dt><dd>{cita.servicio}</dd>
              <dt>Profesional</dt><dd>{cita.profesional}</dd>
              <dt>Día y hora</dt><dd>{fechaLarga(soloFecha(cita.fecha_hora))}, {soloHora(cita.fecha_hora)}</dd>
              <dt>Abono</dt><dd><strong>{pesos(cita.monto_abono)}</strong></dd>
              <dt>Saldo en el local</dt><dd>{pesos(cita.precio - cita.monto_abono)}</dd>
            </dl>
          </section>

          <section className="panel" aria-labelledby="t-p">
            <h2 id="t-p">Pasarela de pago</h2>
            <MensajeInfo>
              Pasarela <strong>simulada</strong> para esta demostración: no se cobra dinero ni se piden datos de tarjeta.
              En producción, aquí la clienta paga en Flow o Webpay Plus y la pasarela avisa al sistema con una notificación firmada.
            </MensajeInfo>

            {!vencida && restante !== null && (
              <p className="cuenta" role="timer">⏳ Tu horario está reservado por <strong>{mmss(restante)}</strong></p>
            )}
            {error && <MensajeError>{error}</MensajeError>}

            {vencida ? (
              <>
                <MensajeError>El tiempo para pagar terminó y el horario se liberó. Elige otro horario y lo reservamos para ti.</MensajeError>
                <button type="button" className="btn" onClick={() => { reiniciar(); ir("/"); }}>Elegir otro horario</button>
              </>
            ) : (
              <div className="botones-pago">
                <button type="button" className="btn" disabled={pagando} onClick={() => void simular("APROBADO")}>
                  {pagando ? "Procesando pago…" : `Simular pago aprobado de ${pesos(cita.monto_abono)}`}
                </button>
                <button type="button" className="btn btn-secundario" disabled={pagando} onClick={() => void simular("RECHAZADO")}>
                  Simular pago rechazado
                </button>
              </div>
            )}
            <p><Link to="/resumen">Volver al resumen</Link></p>
          </section>
        </div>
      )}
    </>
  );
}
