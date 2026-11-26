import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErrorApi, get, post } from "../api";
import { Campo, Cargando, Insignia, MensajeError, MensajeOk, Vacio } from "../componentes/ui";
import { pesos } from "../formato";

interface PagoFila { id_pago: number; id_cita: number; monto: number; estado: string; referencia_externa: string; cliente: string }
interface Audit { id_auditoria: number; accion: string; detalle: string | null; creado_en: string }

/** Registrar o revertir pagos: solo administración con perfil autorizado. Todo queda en auditoría. */
export function Pagos() {
  const [pagos, setPagos] = useState<PagoFila[] | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [idCita, setIdCita] = useState("");
  const [errorCampo, setErrorCampo] = useState<string>();
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [revertir, setRevertir] = useState<PagoFila>();
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([get<PagoFila[]>("/api/admin/pagos"), get<Audit[]>("/api/admin/auditoria")]);
      setPagos(p);
      setAudit(a.slice(0, 15));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos cargar los pagos.");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function registrar(ev: FormEvent) {
    ev.preventDefault();
    setError(undefined);
    setOk(undefined);
    if (!/^\d+$/.test(idCita)) return setErrorCampo("Ingresa el número de la cita");
    setErrorCampo(undefined);
    setEnviando(true);
    try {
      const r = await post<{ resultado: string }>("/api/admin/pagos", { id_cita: Number(idCita) });
      setOk(r.resultado === "PROCESADO" ? "Pago registrado y cita confirmada." : "Ese pago ya estaba registrado.");
      setIdCita("");
      await cargar();
    } catch (x) {
      setError(x instanceof ErrorApi ? x.message : "No pudimos registrar el pago.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarReversa() {
    if (!revertir) return;
    setEnviando(true);
    setError(undefined);
    try {
      await post(`/api/admin/pagos/${revertir.id_pago}/revertir`);
      setOk("Pago revertido. La cita quedó cancelada y el horario libre.");
      setRevertir(undefined);
      await cargar();
    } catch (x) {
      setError(x instanceof ErrorApi ? x.message : "No pudimos revertir el pago.");
      setRevertir(undefined);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Pagos</h1>
      <form onSubmit={registrar} noValidate className="formulario angosto">
        <h2>Registrar pago manual</h2>
        <p className="ayuda">Para abonos pagados por transferencia o en el local. Se registra por el monto exacto del abono.</p>
        <Campo id="cita" etiqueta="N.º de cita" error={errorCampo}>
          {(a) => <input {...a} inputMode="numeric" value={idCita} onChange={(e) => setIdCita(e.target.value)} />}
        </Campo>
        <button type="submit" className="btn" disabled={enviando}>Registrar pago</button>
      </form>
      {ok && <MensajeOk>{ok}</MensajeOk>}
      {error && <MensajeError>{error}</MensajeError>}

      <h2>Últimos pagos</h2>
      {!pagos && !error && <Cargando />}
      {pagos && pagos.length === 0 && <Vacio titulo="Aún no hay pagos" />}
      {pagos && pagos.length > 0 && (
        <ul className="agenda">
          {pagos.map((p) => (
            <li key={p.id_pago} className="fila-agenda">
              <span className="hora-agenda">Cita {p.id_cita}</span>
              <span className="detalle">{p.cliente} · {pesos(p.monto)}<br /><small>Ref. {p.referencia_externa}</small></span>
              <Insignia estado={p.estado} />
              {p.estado === "APROBADO" && <button type="button" className="btn btn-secundario" onClick={() => setRevertir(p)}>Revertir</button>}
            </li>
          ))}
        </ul>
      )}

      <h2>Auditoría reciente</h2>
      {audit.length === 0 ? <Vacio titulo="Sin registros" /> : (
        <ul className="agenda">
          {audit.map((a) => (
            <li key={a.id_auditoria} className="fila-agenda">
              <span className="hora-agenda">{new Date(a.creado_en).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</span>
              <span className="detalle"><strong>{a.accion}</strong>{a.detalle && <><br /><small>{a.detalle}</small></>}</span>
            </li>
          ))}
        </ul>
      )}

      {revertir && (
        <div className="modal-fondo" role="presentation">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="t-rev">
            <h2 id="t-rev">¿Revertir este pago?</h2>
            <p>Pago de {pesos(revertir.monto)} de {revertir.cliente}. La cita {revertir.id_cita} quedará cancelada y su horario libre. Quedará registrado en la auditoría.</p>
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" autoFocus onClick={() => setRevertir(undefined)} disabled={enviando}>No, volver</button>
              <button type="button" className="btn btn-peligro" onClick={() => void confirmarReversa()} disabled={enviando}>Sí, revertir pago</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
