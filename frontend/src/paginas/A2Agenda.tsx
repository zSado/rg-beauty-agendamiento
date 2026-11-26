import { useEffect, useState } from "react";
import { ErrorApi, get, type CitaDetalle, type Profesional } from "../api";
import { useAuth } from "../auth";
import { Campo, Cargando, Insignia, MensajeError, MensajeInfo, Vacio } from "../componentes/ui";
import { fechaLarga, hoyChile, pesos, soloHora } from "../formato";

/** A2 · Agenda del día. El profesional ve solo lo propio; administración ve todo y puede filtrar. */
export function Agenda() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMIN";
  const [fecha, setFecha] = useState(hoyChile());
  const [prof, setProf] = useState("");
  const [profs, setProfs] = useState<Profesional[]>([]);
  const [citas, setCitas] = useState<CitaDetalle[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (esAdmin) get<Profesional[]>("/api/profesionales").then(setProfs).catch(() => undefined);
  }, [esAdmin]);

  useEffect(() => {
    if (!fecha) return;
    let activo = true;
    setCitas(null);
    setError(undefined);
    get<CitaDetalle[]>(`/api/agenda?fecha=${fecha}${prof ? `&id_profesional=${prof}` : ""}`)
      .then((c) => activo && setCitas(c))
      .catch((e) => activo && setError(e instanceof ErrorApi ? e.message : "No pudimos cargar la agenda."));
    return () => {
      activo = false;
    };
  }, [fecha, prof]);

  return (
    <>
      <h1>Agenda del día</h1>
      {!esAdmin && <MensajeInfo>Aquí ves solo las citas que tienes asignadas.</MensajeInfo>}
      <div className="filtros">
        <Campo id="fecha" etiqueta="Día">
          {(a) => <input {...a} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
        </Campo>
        {esAdmin && (
          <Campo id="prof" etiqueta="Profesional">
            {(a) => (
              <select {...a} value={prof} onChange={(e) => setProf(e.target.value)}>
                <option value="">Todas</option>
                {profs.map((p) => <option key={p.id_profesional} value={p.id_profesional}>{p.nombre}</option>)}
              </select>
            )}
          </Campo>
        )}
      </div>
      {fecha && <h2>{fechaLarga(fecha)}</h2>}
      {error && <MensajeError>{error}</MensajeError>}
      {!citas && !error && <Cargando texto="Cargando agenda" />}
      {citas && citas.length === 0 && <Vacio icono="📅" titulo="No hay citas para este día" />}
      {citas && citas.length > 0 && (
        <ul className="agenda">
          {citas.map((c) => (
            <li key={c.id_cita} className="fila-agenda">
              <span className="hora-agenda">{soloHora(c.fecha_hora)}–{soloHora(c.fecha_hora_fin)}</span>
              <span className="detalle">
                <strong>{c.servicio}</strong> · {c.cliente}
                {esAdmin && <> · con {c.profesional}</>}
                <br /><small>Abono {pesos(c.monto_abono)} · Pagado {pesos(c.pagado)}</small>
              </span>
              <Insignia estado={c.estado} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
