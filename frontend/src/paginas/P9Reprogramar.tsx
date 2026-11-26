import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorApi, get, put, type CitaDetalle } from "../api";
import { Campo, Cargando, MensajeError, Vacio } from "../componentes/ui";
import { fechaLarga, hoyChile, soloFecha, soloHora } from "../formato";

/** P9 · Reprogramar una cita (UPDATE): mismo servicio y profesional, nuevo día y hora. */
export function Reprogramar() {
  const { id } = useParams();
  const ir = useNavigate();
  const [cita, setCita] = useState<CitaDetalle>();
  const [fecha, setFecha] = useState("");
  const [horas, setHoras] = useState<string[] | null>(null);
  const [hora, setHora] = useState("");
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    get<CitaDetalle>(`/api/citas/${id}`).then(setCita).catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar la cita."));
  }, [id]);

  useEffect(() => {
    if (!cita || !fecha) return;
    let activo = true;
    setHoras(null);
    setHora("");
    get<{ horas: string[] }>(`/api/horarios?id_profesional=${cita.id_profesional}&id_servicio=${cita.id_servicio}&fecha=${fecha}`)
      .then((x) => activo && setHoras(x.horas))
      .catch((e) => activo && setError(e instanceof ErrorApi ? e.message : "No pudimos buscar horarios."));
    return () => { activo = false; };
  }, [cita, fecha]);

  async function guardar() {
    setEnviando(true);
    setError(undefined);
    try {
      await put(`/api/citas/${id}/reprogramar`, { fecha_hora: `${fecha}T${hora}` });
      ir("/mis-citas", { replace: true });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos reprogramar la cita.");
    } finally {
      setEnviando(false);
    }
  }

  if (!cita && !error) return <Cargando />;
  return (
    <>
      <h1>Reprogramar cita</h1>
      {error && <MensajeError>{error}</MensajeError>}
      {cita && (
        <>
          <p className="lead">{cita.servicio} con {cita.profesional}. Hoy: {fechaLarga(soloFecha(cita.fecha_hora))}, {soloHora(cita.fecha_hora)}. Tu abono se mantiene.</p>
          <Campo id="fecha" etiqueta="Nuevo día">
            {(a) => <input {...a} type="date" min={hoyChile()} value={fecha} onChange={(e) => setFecha(e.target.value)} />}
          </Campo>
          {fecha && !horas && <Cargando texto="Buscando horarios" />}
          {horas && horas.length === 0 && <Vacio icono="📅" titulo="No hay horas disponibles ese día. Prueba otro día." />}
          {horas && horas.length > 0 && (
            <div className="horas" role="radiogroup" aria-label="Horas disponibles">
              {horas.map((h) => (
                <button key={h} type="button" role="radio" aria-checked={hora === h} className={`hora ${hora === h ? "sel" : ""}`} onClick={() => setHora(h)}>
                  <span aria-hidden="true">{hora === h ? "●" : "○"}</span> {h}<small>{hora === h ? "Seleccionado" : "Disponible"}</small>
                </button>
              ))}
            </div>
          )}
          <div className="barra-accion">
            <Link to="/mis-citas" className="btn btn-secundario">Volver</Link>
            <button type="button" className="btn" disabled={!hora || enviando} onClick={() => void guardar()}>{enviando ? "Guardando…" : "Confirmar cambio"}</button>
          </div>
        </>
      )}
    </>
  );
}
