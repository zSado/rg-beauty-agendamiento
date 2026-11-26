import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErrorApi, del, get, post, type Bloqueo, type Profesional } from "../api";
import { useAuth } from "../auth";
import { Campo, Cargando, MensajeError, MensajeOk, Vacio } from "../componentes/ui";
import { fechaLarga, soloFecha, soloHora } from "../formato";

/** A3 · Disponibilidad: bloquear y liberar horarios. Avisa si hay citas activas en ese horario. */
export function Disponibilidad() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMIN";
  const [lista, setLista] = useState<Bloqueo[] | null>(null);
  const [profs, setProfs] = useState<Profesional[]>([]);
  const [f, setF] = useState({ prof: "", inicio: "", fin: "", motivo: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [aviso, setAviso] = useState<{ ok: string; advertencia?: string }>();
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await get<Bloqueo[]>("/api/bloqueos"));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos cargar los bloqueos.");
    }
  }, []);
  useEffect(() => {
    void cargar();
    if (esAdmin) get<Profesional[]>("/api/profesionales").then(setProfs).catch(() => undefined);
  }, [cargar, esAdmin]);

  async function crear(ev: FormEvent) {
    ev.preventDefault();
    setError(undefined);
    setAviso(undefined);
    const e: Record<string, string> = {};
    if (!f.inicio) e.inicio = "Indica cuándo empieza el bloqueo";
    if (!f.fin) e.fin = "Indica cuándo termina el bloqueo";
    else if (f.inicio && f.fin <= f.inicio) e.fin = "El fin debe ser posterior al inicio";
    if (esAdmin && !f.prof) e.prof = "Elige un profesional";
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setEnviando(true);
    try {
      const b = await post<Bloqueo>("/api/bloqueos", {
        id_profesional: esAdmin ? Number(f.prof) : undefined,
        inicio: f.inicio,
        fin: f.fin,
        motivo: f.motivo || undefined,
      });
      setAviso({
        ok: "Horario bloqueado.",
        advertencia: b.citas_activas_en_bloqueo
          ? `Atención: hay ${b.citas_activas_en_bloqueo} cita(s) activa(s) en ese horario. El bloqueo no las cancela; revísalas en la agenda.`
          : undefined,
      });
      setF({ ...f, inicio: "", fin: "", motivo: "" });
      await cargar();
    } catch (x) {
      setError(x instanceof ErrorApi ? x.message : "No pudimos bloquear el horario.");
    } finally {
      setEnviando(false);
    }
  }

  async function liberar(id: number) {
    setError(undefined);
    try {
      await del(`/api/bloqueos/${id}`);
      setAviso({ ok: "Horario liberado." });
      await cargar();
    } catch (x) {
      setError(x instanceof ErrorApi ? x.message : "No pudimos liberar el horario.");
    }
  }

  return (
    <>
      <h1>Disponibilidad</h1>
      <form onSubmit={crear} noValidate className="formulario">
        <h2>Bloquear un horario</h2>
        {esAdmin && (
          <Campo id="prof" etiqueta="Profesional" error={errores.prof}>
            {(a) => (
              <select {...a} value={f.prof} onChange={(e) => setF({ ...f, prof: e.target.value })}>
                <option value="">Elige…</option>
                {profs.map((p) => <option key={p.id_profesional} value={p.id_profesional}>{p.nombre}</option>)}
              </select>
            )}
          </Campo>
        )}
        <Campo id="inicio" etiqueta="Desde" error={errores.inicio}>
          {(a) => <input {...a} type="datetime-local" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} />}
        </Campo>
        <Campo id="fin" etiqueta="Hasta" error={errores.fin}>
          {(a) => <input {...a} type="datetime-local" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />}
        </Campo>
        <Campo id="motivo" etiqueta="Motivo (opcional)">
          {(a) => <input {...a} maxLength={200} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />}
        </Campo>
        <button type="submit" className="btn" disabled={enviando}>{enviando ? "Guardando…" : "Bloquear horario"}</button>
      </form>

      {aviso && <MensajeOk>{aviso.ok}</MensajeOk>}
      {aviso?.advertencia && <MensajeError>{aviso.advertencia}</MensajeError>}
      {error && <MensajeError>{error}</MensajeError>}

      <h2>Bloqueos vigentes</h2>
      {!lista && !error && <Cargando />}
      {lista && lista.length === 0 && <Vacio icono="📅" titulo="No hay horarios bloqueados" />}
      {lista && lista.length > 0 && (
        <ul className="agenda">
          {lista.map((b) => (
            <li key={b.id_bloqueo} className="fila-agenda">
              <span className="hora-agenda">{fechaLarga(soloFecha(b.inicio))}<br />{soloHora(b.inicio)}–{soloHora(b.fin)}</span>
              <span className="detalle">{b.motivo ?? "Sin motivo"}{esAdmin && <><br /><small>Profesional n.º {b.id_profesional}</small></>}</span>
              <button type="button" className="btn btn-secundario" onClick={() => void liberar(b.id_bloqueo)}>Liberar</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
