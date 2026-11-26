import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorApi, get, post, type CitaDetalle } from "../api";
import { Cargando, Insignia, MensajeError, MensajeOk, Vacio } from "../componentes/ui";
import { fechaLarga, pesos, soloFecha, soloHora } from "../formato";
import { useReserva } from "../reserva";

/** P7 · Mis citas, con P8 · Cancelar cita */
export function MisCitas() {
  const [citas, setCitas] = useState<CitaDetalle[] | null>(null);
  const [error, setError] = useState<string>();
  const [aviso, setAviso] = useState<string>();
  const [cancelando, setCancelando] = useState<CitaDetalle>();
  const [enviando, setEnviando] = useState(false);
  const { set } = useReserva();
  const ir = useNavigate();

  const cargar = useCallback(async () => {
    setError(undefined);
    try {
      setCitas(await get<CitaDetalle[]>("/api/citas/mias"));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos cargar tus citas.");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function confirmarCancelacion() {
    if (!cancelando) return;
    setEnviando(true);
    try {
      const r = await post<{ politica_abono: string }>(`/api/citas/${cancelando.id_cita}/cancelar`);
      setAviso(`Cita cancelada. ${r.politica_abono}`);
      setCancelando(undefined);
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos cancelar la cita.");
      setCancelando(undefined);
    } finally {
      setEnviando(false);
    }
  }

  function pagar(c: CitaDetalle) {
    set({ cita: c, venceEn: Date.now() + (c.segundos_restantes ?? 0) * 1000 });
    ir(`/pago?cita=${c.id_cita}`);
  }

  return (
    <>
      <h1>Mis citas</h1>
      {aviso && <MensajeOk>{aviso}</MensajeOk>}
      {error && <MensajeError>{error}</MensajeError>}
      {!citas && !error && <Cargando texto="Cargando tus citas" />}
      {citas && citas.length === 0 && (
        <Vacio titulo="Aún no tienes citas">
          <Link to="/" className="btn">Reservar</Link>
        </Vacio>
      )}
      {citas && citas.length > 0 && (
        <ul className="lista-tarjetas">
          {citas.map((c) => {
            const activa = c.estado === "CONFIRMADA" || c.estado === "PENDIENTE_PAGO";
            return (
              <li key={c.id_cita} className="tarjeta">
                <h2>{c.servicio}</h2>
                <p><Insignia estado={c.estado} /></p>
                <p className="meta">{fechaLarga(soloFecha(c.fecha_hora))}, {soloHora(c.fecha_hora)} · con {c.profesional}</p>
                <p className="meta">Abono {pesos(c.monto_abono)} · Pagado {pesos(c.pagado)} · Saldo en el local {pesos(c.precio - c.pagado)}</p>
                <div className="barra-accion">
                  {c.estado === "PENDIENTE_PAGO" && (c.segundos_restantes ?? 0) > 0 && (
                    <button type="button" className="btn" onClick={() => pagar(c)}>Pagar abono</button>
                  )}
                  {activa && <Link to={`/reprogramar/${c.id_cita}`} className="btn btn-secundario">Reprogramar</Link>}
                  {activa && <button type="button" className="btn btn-secundario" onClick={() => setCancelando(c)}>Cancelar cita</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cancelando && (
        <div className="modal-fondo" role="presentation">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="t-cancel" aria-describedby="d-cancel">
            <h2 id="t-cancel">¿Cancelar tu cita?</h2>
            <p id="d-cancel">
              {cancelando.servicio}, {fechaLarga(soloFecha(cancelando.fecha_hora))} a las {soloHora(cancelando.fecha_hora)}.{" "}
              {cancelando.estado === "CONFIRMADA"
                ? "Tu horario quedará libre. La administración revisará la devolución de tu abono."
                : "Tu horario quedará libre. No se cobró ningún abono."}
            </p>
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" autoFocus onClick={() => setCancelando(undefined)} disabled={enviando}>No, mantenerla</button>
              <button type="button" className="btn btn-peligro" onClick={() => void confirmarCancelacion()} disabled={enviando}>
                {enviando ? "Cancelando…" : "Sí, cancelar mi cita"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
