import { useCallback, useEffect, useState } from "react";
import { ErrorApi, del, get, type CitaDetalle, type Indicadores, type Profesional, type ReporteCitas, type Servicio } from "../api";
import { Campo, Cargando, Insignia, MensajeError, MensajeOk, Vacio } from "../componentes/ui";
import { hoyChile, pesos, soloFecha, soloHora, sumarDias } from "../formato";

const ELIMINABLE = (c: CitaDetalle) => (c.estado === "CANCELADA" || c.estado === "EXPIRADA") && c.pagado === 0;

function descargarCsv(filas: CitaDetalle[], desde: string, hasta: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const cab = ["N°", "Fecha", "Hora", "Clienta", "Servicio", "Profesional", "Estado", "Abono", "Pagado"];
  const lineas = filas.map((c) => [c.id_cita, soloFecha(c.fecha_hora), soloHora(c.fecha_hora), c.cliente, c.servicio, c.profesional, c.estado, c.monto_abono, c.pagado].map(esc).join(";"));
  const blob = new Blob(["﻿" + [cab.map(esc).join(";"), ...lineas].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reporte-citas-${desde}_${hasta}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** A4 · Reportes: tabla de citas por rango de fechas (consulta la BD en cada búsqueda) + indicadores. */
export function Reportes() {
  const hoy = hoyChile();
  const [f, setF] = useState({ desde: sumarDias(hoy, -30), hasta: sumarDias(hoy, 30), estado: "", prof: "", serv: "" });
  const [profs, setProfs] = useState<Profesional[]>([]);
  const [servs, setServs] = useState<Servicio[]>([]);
  const [rep, setRep] = useState<ReporteCitas | null>(null);
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string>();
  const [aviso, setAviso] = useState<string>();
  const [porEliminar, setPorEliminar] = useState<CitaDetalle>();

  const consultar = useCallback(async () => {
    setError(undefined);
    if (!f.desde || !f.hasta || f.hasta < f.desde) return setError("La fecha final debe ser igual o posterior a la inicial.");
    setCargando(true);
    try {
      const q = new URLSearchParams({ desde: f.desde, hasta: f.hasta });
      if (f.estado) q.set("estado", f.estado);
      if (f.prof) q.set("id_profesional", f.prof);
      if (f.serv) q.set("id_servicio", f.serv);
      const [r, i] = await Promise.all([
        get<ReporteCitas>(`/api/admin/reporte/citas?${q}`),
        get<Indicadores>(`/api/admin/indicadores?desde=${f.desde}&hasta=${f.hasta}`),
      ]);
      setRep(r);
      setInd(i);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos generar el reporte.");
    } finally {
      setCargando(false);
    }
  }, [f]);

  useEffect(() => {
    void consultar();
    get<Profesional[]>("/api/profesionales").then(setProfs).catch(() => undefined);
    get<Servicio[]>("/api/servicios").then(setServs).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function eliminar() {
    if (!porEliminar) return;
    try {
      await del(`/api/admin/citas/${porEliminar.id_cita}`);
      setAviso(`Cita n.º ${porEliminar.id_cita} eliminada.`);
      setPorEliminar(undefined);
      await consultar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos eliminar la cita.");
      setPorEliminar(undefined);
    }
  }

  return (
    <>
      <h1>Reportes</h1>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); void consultar(); }}>
        <Campo id="desde" etiqueta="Desde">{(a) => <input {...a} type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />}</Campo>
        <Campo id="hasta" etiqueta="Hasta">{(a) => <input {...a} type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />}</Campo>
        <Campo id="estado" etiqueta="Estado">
          {(a) => (
            <select {...a} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="">Todos</option>
              <option value="CONFIRMADA">Confirmada</option>
              <option value="PENDIENTE_PAGO">Pendiente de pago</option>
              <option value="CANCELADA">Cancelada</option>
              <option value="EXPIRADA">Expirada</option>
            </select>
          )}
        </Campo>
        <Campo id="prof" etiqueta="Profesional">
          {(a) => (
            <select {...a} value={f.prof} onChange={(e) => setF({ ...f, prof: e.target.value })}>
              <option value="">Todos</option>
              {profs.map((p) => <option key={p.id_profesional} value={p.id_profesional}>{p.nombre}</option>)}
            </select>
          )}
        </Campo>
        <Campo id="serv" etiqueta="Servicio">
          {(a) => (
            <select {...a} value={f.serv} onChange={(e) => setF({ ...f, serv: e.target.value })}>
              <option value="">Todos</option>
              {servs.map((s) => <option key={s.id_servicio} value={s.id_servicio}>{s.nombre}</option>)}
            </select>
          )}
        </Campo>
        <button type="submit" className="btn" disabled={cargando}>Generar reporte</button>
      </form>

      {error && <MensajeError>{error}</MensajeError>}
      {aviso && <MensajeOk>{aviso}</MensajeOk>}
      {cargando && <Cargando texto="Consultando la base de datos" />}

      {!cargando && ind && (
        <div className="indicadores">
          <article className="indicador"><h2>Ocupación</h2><p className="valor">{ind.ocupacion_pct.toLocaleString("es-CL")} %</p><small>Horas atendidas ÷ horas disponibles</small></article>
          <article className="indicador"><h2>Cancelación</h2><p className="valor">{ind.cancelacion_pct.toLocaleString("es-CL")} %</p><small>{ind.citas_canceladas} canceladas de {ind.citas_confirmadas + ind.citas_canceladas}</small></article>
          <article className="indicador"><h2>Tiempo muerto</h2><p className="valor">{ind.tiempo_muerto_min.toLocaleString("es-CL")} min</p><small>Huecos entre citas</small></article>
          <article className="indicador"><h2>Traslapes</h2><p className="valor">{ind.traslapes === 0 ? "✔ 0" : `⚠ ${ind.traslapes}`}</p><small>Meta: 0</small></article>
        </div>
      )}

      {!cargando && rep && (
        <>
          <h2>Citas del periodo</h2>
          <p className="meta">
            {rep.totales.cantidad} cita(s) · Abonos pagados {pesos(rep.totales.abono_pagado)} · Abonos pendientes {pesos(rep.totales.abono_pendiente)}
            {rep.limitado && " · Se muestran las primeras 1.000; acota el rango."}
          </p>
          {rep.filas.length === 0 ? (
            <Vacio icono="📅" titulo="No hay citas con esos filtros" />
          ) : (
            <>
              <div className="barra-accion">
                <button type="button" className="btn btn-secundario" onClick={() => descargarCsv(rep.filas, f.desde, f.hasta)}>Descargar CSV</button>
              </div>
              <div className="tabla-scroll">
                <table className="tabla">
                  <caption className="solo-lectores">Citas entre {f.desde} y {f.hasta}</caption>
                  <thead>
                    <tr><th>N.º</th><th>Fecha</th><th>Hora</th><th>Clienta</th><th>Servicio</th><th>Profesional</th><th>Estado</th><th>Abono</th><th>Pagado</th><th>Acción</th></tr>
                  </thead>
                  <tbody>
                    {rep.filas.map((c) => (
                      <tr key={c.id_cita}>
                        <td>{c.id_cita}</td><td>{soloFecha(c.fecha_hora)}</td><td>{soloHora(c.fecha_hora)}</td>
                        <td>{c.cliente}</td><td>{c.servicio}</td><td>{c.profesional}</td>
                        <td><Insignia estado={c.estado} /></td>
                        <td>{pesos(c.monto_abono)}</td><td>{pesos(c.pagado)}</td>
                        <td>{ELIMINABLE(c) ? <button type="button" className="btn btn-secundario btn-chico" onClick={() => setPorEliminar(c)}>Eliminar</button> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {porEliminar && (
        <div className="modal-fondo" role="presentation">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="t-el">
            <h2 id="t-el">¿Eliminar la cita n.º {porEliminar.id_cita}?</h2>
            <p>{porEliminar.servicio} de {porEliminar.cliente}, {soloFecha(porEliminar.fecha_hora)}. Esta acción no se puede deshacer.</p>
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" autoFocus onClick={() => setPorEliminar(undefined)}>No, conservarla</button>
              <button type="button" className="btn btn-peligro" onClick={() => void eliminar()}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
