import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ErrorApi, get, type Profesional } from "../api";
import { Campo, Cargando, MensajeError, Pasos, Vacio } from "../componentes/ui";
import { fechaLarga, hoyChile, pesos } from "../formato";
import { useReserva } from "../reserva";

/** P2 · Profesional y horario */
export function Horario() {
  const { r, set } = useReserva();
  const ir = useNavigate();
  const [profs, setProfs] = useState<Profesional[] | null>(null);
  const [horas, setHoras] = useState<string[] | null>(null);
  const [cargandoHoras, setCargandoHoras] = useState(false);
  const [error, setError] = useState<string>();
  const hoy = hoyChile();

  const servicio = r.servicio;
  const idServicio = servicio?.id_servicio;

  useEffect(() => {
    if (!idServicio) return;
    let activo = true;
    get<Profesional[]>(`/api/profesionales?id_servicio=${idServicio}`)
      .then((p) => {
        if (!activo) return;
        setProfs(p);
        if (p.length === 1 && !r.profesional) set({ profesional: p[0] });
      })
      .catch((e) => activo && setError(e instanceof ErrorApi ? e.message : "No pudimos cargar los profesionales."));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idServicio]);

  const idProf = r.profesional?.id_profesional;
  useEffect(() => {
    if (!idServicio || !idProf || !r.fecha) return;
    let activo = true;
    setCargandoHoras(true);
    setHoras(null);
    setError(undefined);
    get<{ horas: string[] }>(`/api/horarios?id_profesional=${idProf}&id_servicio=${idServicio}&fecha=${r.fecha}`)
      .then((x) => activo && setHoras(x.horas))
      .catch((e) => activo && setError(e instanceof ErrorApi ? e.message : "No pudimos buscar horarios."))
      .finally(() => activo && setCargandoHoras(false));
    return () => {
      activo = false;
    };
  }, [idServicio, idProf, r.fecha]);

  if (!servicio) return <Navigate to="/" replace />;

  return (
    <>
      <Pasos actual={2} />
      <h1>Elige profesional y horario</h1>
      <div className="dos-columnas">
        <section aria-labelledby="t-prof">
          <h2 id="t-prof">1. Profesional</h2>
          {profs === null && !error && <Cargando texto="Cargando profesionales" />}
          {profs && profs.length === 0 && <Vacio titulo="Por ahora no hay profesionales para este servicio." />}
          {profs && profs.length > 0 && (
            <div className="opciones" role="radiogroup" aria-label="Profesional">
              {profs.map((p) => (
                <label key={p.id_profesional} className={`opcion ${idProf === p.id_profesional ? "sel" : ""}`}>
                  <input
                    type="radio"
                    name="prof"
                    checked={idProf === p.id_profesional}
                    onChange={() => set({ profesional: p, hora: undefined })}
                  />
                  <span><strong>{p.nombre}</strong><br /><small>{p.especialidad}</small></span>
                </label>
              ))}
            </div>
          )}

          <h2>2. Día</h2>
          <Campo id="fecha" etiqueta="Día de tu cita">
            {(a) => (
              <input
                {...a}
                type="date"
                min={hoy}
                value={r.fecha ?? ""}
                onChange={(e) => set({ fecha: e.target.value || undefined, hora: undefined })}
                disabled={!idProf}
              />
            )}
          </Campo>
          {!idProf && <small className="ayuda">Primero elige un profesional.</small>}

          <h2>3. Hora</h2>
          {error && <MensajeError>{error}</MensajeError>}
          {cargandoHoras && <Cargando texto="Buscando horarios" />}
          {!cargandoHoras && horas && horas.length === 0 && (
            <Vacio icono="📅" titulo="No hay horas disponibles este día. Prueba otro día u otra profesional." />
          )}
          {!cargandoHoras && horas && horas.length > 0 && (
            <div className="horas" role="radiogroup" aria-label="Horas disponibles">
              {horas.map((h) => {
                const sel = r.hora === h;
                return (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    className={`hora ${sel ? "sel" : ""}`}
                    onClick={() => set({ hora: h })}
                  >
                    <span aria-hidden="true">{sel ? "●" : "○"}</span> {h}
                    <small>{sel ? "Seleccionado" : "Disponible"}</small>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="panel" aria-label="Resumen de tu reserva">
          <h2>Tu reserva</h2>
          <dl className="resumen">
            <dt>Servicio</dt><dd>{servicio.nombre}</dd>
            <dt>Duración</dt><dd>{servicio.duracion_min} min</dd>
            <dt>Profesional</dt><dd>{r.profesional?.nombre ?? "—"}</dd>
            <dt>Día</dt><dd>{r.fecha ? fechaLarga(r.fecha) : "—"}</dd>
            <dt>Hora</dt><dd>{r.hora ?? "—"}</dd>
            <dt>Abono</dt><dd>{pesos(servicio.monto_abono)}</dd>
          </dl>
          <div className="barra-accion">
            <Link to="/" className="btn btn-secundario">Cambiar servicio</Link>
            <button type="button" className="btn" disabled={!r.hora} onClick={() => ir("/datos")}>Continuar</button>
          </div>
          {!r.hora && <small className="ayuda">Elige una hora para continuar.</small>}
        </aside>
      </div>
    </>
  );
}
