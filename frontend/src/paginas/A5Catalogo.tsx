import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErrorApi, del, get, post, put, type ProfesionalAdmin, type Servicio, type Ventana } from "../api";
import { Campo, Cargando, MensajeError, MensajeOk } from "../componentes/ui";
import { pesos } from "../formato";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
type Msg = { tipo: "ok" | "error"; texto: string };

/** A5 · Catálogo (solo administración): CRUD de servicios y profesionales, con horario semanal. */
export function Catalogo() {
  const [tab, setTab] = useState<"servicios" | "profesionales">("servicios");
  const [servs, setServs] = useState<Servicio[] | null>(null);
  const [profs, setProfs] = useState<ProfesionalAdmin[] | null>(null);
  const [msg, setMsg] = useState<Msg>();

  const cargar = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([get<Servicio[]>("/api/servicios"), get<ProfesionalAdmin[]>("/api/admin/profesionales")]);
      setServs(s);
      setProfs(p);
    } catch (e) {
      setMsg({ tipo: "error", texto: e instanceof ErrorApi ? e.message : "No pudimos cargar el catálogo." });
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const ok = (texto: string) => setMsg({ tipo: "ok", texto });
  const fallo = (e: unknown) => setMsg({ tipo: "error", texto: e instanceof ErrorApi ? e.message : "No pudimos completar la acción." });

  return (
    <>
      <h1>Catálogo</h1>
      <div className="barra-accion" role="tablist" aria-label="Sección">
        <button type="button" role="tab" aria-selected={tab === "servicios"} className={`btn ${tab === "servicios" ? "" : "btn-secundario"}`} onClick={() => setTab("servicios")}>Servicios</button>
        <button type="button" role="tab" aria-selected={tab === "profesionales"} className={`btn ${tab === "profesionales" ? "" : "btn-secundario"}`} onClick={() => setTab("profesionales")}>Profesionales</button>
      </div>
      {msg?.tipo === "ok" && <MensajeOk>{msg.texto}</MensajeOk>}
      {msg?.tipo === "error" && <MensajeError>{msg.texto}</MensajeError>}
      {(!servs || !profs) && !msg && <Cargando />}
      {servs && profs && tab === "servicios" && <PanelServicios servs={servs} recargar={cargar} ok={ok} fallo={fallo} limpiar={() => setMsg(undefined)} />}
      {servs && profs && tab === "profesionales" && <PanelProfesionales servs={servs} profs={profs} recargar={cargar} ok={ok} fallo={fallo} limpiar={() => setMsg(undefined)} />}
    </>
  );
}

interface Comun { recargar: () => Promise<void>; ok: (t: string) => void; fallo: (e: unknown) => void; limpiar: () => void }

function PanelServicios({ servs, recargar, ok, fallo, limpiar }: Comun & { servs: Servicio[] }) {
  const vacio = { id: 0, nombre: "", precio: "", duracion: "", pct: "20" };
  const [f, setF] = useState(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [porEliminar, setPorEliminar] = useState<Servicio>();

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    limpiar();
    const e: Record<string, string> = {};
    if (f.nombre.trim().length < 2) e.nombre = "Ingresa el nombre";
    if (!(Number(f.precio) >= 1)) e.precio = "Ingresa un precio mayor que 0";
    if (!(Number(f.duracion) >= 5)) e.duracion = "Mínimo 5 minutos";
    if (f.pct === "" || Number(f.pct) < 0 || Number(f.pct) > 100) e.pct = "Entre 0 y 100";
    setErrores(e);
    if (Object.keys(e).length) return;
    const cuerpo = { nombre: f.nombre.trim(), precio: Number(f.precio), duracion_min: Number(f.duracion), pct_abono: Number(f.pct) };
    try {
      if (f.id) await put(`/api/admin/servicios/${f.id}`, cuerpo); else await post("/api/admin/servicios", cuerpo);
      ok(f.id ? "Servicio actualizado." : "Servicio creado.");
      setF(vacio);
      await recargar();
    } catch (x) { fallo(x); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    limpiar();
    try { await del(`/api/admin/servicios/${porEliminar.id_servicio}`); ok("Servicio eliminado."); await recargar(); } catch (x) { fallo(x); }
    setPorEliminar(undefined);
  }

  return (
    <>
      <form onSubmit={guardar} noValidate className="formulario">
        <h2>{f.id ? "Editar servicio" : "Nuevo servicio"}</h2>
        <Campo id="s-nombre" etiqueta="Nombre" error={errores.nombre}>{(a) => <input {...a} maxLength={80} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />}</Campo>
        <Campo id="s-precio" etiqueta="Precio (CLP)" error={errores.precio}>{(a) => <input {...a} inputMode="numeric" type="number" min={1} value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} />}</Campo>
        <Campo id="s-dur" etiqueta="Duración (minutos)" error={errores.duracion}>{(a) => <input {...a} type="number" min={5} value={f.duracion} onChange={(e) => setF({ ...f, duracion: e.target.value })} />}</Campo>
        <Campo id="s-pct" etiqueta="Porcentaje de abono (%)" error={errores.pct} ayuda="Cambiarlo no afecta a las citas ya reservadas.">{(a) => <input {...a} type="number" min={0} max={100} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} />}</Campo>
        <div className="barra-accion">
          {f.id !== 0 && <button type="button" className="btn btn-secundario" onClick={() => { setF(vacio); setErrores({}); }}>Cancelar edición</button>}
          <button type="submit" className="btn">{f.id ? "Guardar cambios" : "Crear servicio"}</button>
        </div>
      </form>

      <h2>Servicios ({servs.length})</h2>
      <ul className="lista-tarjetas">
        {servs.map((s) => (
          <li key={s.id_servicio} className="tarjeta">
            <h3>{s.nombre}</h3>
            <p className="meta">{pesos(s.precio)} · {s.duracion_min} min · abono {s.pct_abono} % ({pesos(s.monto_abono)})</p>
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" onClick={() => { limpiar(); setF({ id: s.id_servicio, nombre: s.nombre, precio: String(s.precio), duracion: String(s.duracion_min), pct: String(s.pct_abono) }); window.scrollTo({ top: 0 }); }}>Editar</button>
              <button type="button" className="btn btn-secundario" onClick={() => setPorEliminar(s)}>Eliminar</button>
            </div>
          </li>
        ))}
      </ul>
      {porEliminar && <Confirmar titulo={`¿Eliminar «${porEliminar.nombre}»?`} texto="Solo se puede eliminar si no tiene citas asociadas." onNo={() => setPorEliminar(undefined)} onSi={() => void eliminar()} />}
    </>
  );
}

function PanelProfesionales({ servs, profs, recargar, ok, fallo, limpiar }: Comun & { servs: Servicio[]; profs: ProfesionalAdmin[] }) {
  const vacio = { id: 0, nombre: "", especialidad: "", servicios: [] as number[] };
  const [f, setF] = useState(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [porEliminar, setPorEliminar] = useState<ProfesionalAdmin>();
  const [horarioDe, setHorarioDe] = useState<ProfesionalAdmin>();

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    limpiar();
    const e: Record<string, string> = {};
    if (f.nombre.trim().length < 2) e.nombre = "Ingresa el nombre";
    if (f.especialidad.trim().length < 2) e.especialidad = "Ingresa la especialidad";
    setErrores(e);
    if (Object.keys(e).length) return;
    const cuerpo = { nombre: f.nombre.trim(), especialidad: f.especialidad.trim(), servicios: f.servicios };
    try {
      if (f.id) await put(`/api/admin/profesionales/${f.id}`, cuerpo); else await post("/api/admin/profesionales", cuerpo);
      ok(f.id ? "Profesional actualizado." : "Profesional creado. Define su horario semanal para que pueda recibir reservas.");
      setF(vacio);
      await recargar();
    } catch (x) { fallo(x); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    limpiar();
    try { await del(`/api/admin/profesionales/${porEliminar.id_profesional}`); ok("Profesional eliminado."); await recargar(); } catch (x) { fallo(x); }
    setPorEliminar(undefined);
  }

  return (
    <>
      <form onSubmit={guardar} noValidate className="formulario">
        <h2>{f.id ? "Editar profesional" : "Nuevo profesional"}</h2>
        <Campo id="p-nombre" etiqueta="Nombre" error={errores.nombre}>{(a) => <input {...a} maxLength={100} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />}</Campo>
        <Campo id="p-esp" etiqueta="Especialidad" error={errores.especialidad}>{(a) => <input {...a} maxLength={100} value={f.especialidad} onChange={(e) => setF({ ...f, especialidad: e.target.value })} />}</Campo>
        <fieldset>
          <legend>Servicios que realiza</legend>
          {servs.map((s) => (
            <label key={s.id_servicio} className="check">
              <input type="checkbox" checked={f.servicios.includes(s.id_servicio)} onChange={(e) => setF({ ...f, servicios: e.target.checked ? [...f.servicios, s.id_servicio] : f.servicios.filter((x) => x !== s.id_servicio) })} /> {s.nombre}
            </label>
          ))}
        </fieldset>
        <div className="barra-accion">
          {f.id !== 0 && <button type="button" className="btn btn-secundario" onClick={() => { setF(vacio); setErrores({}); }}>Cancelar edición</button>}
          <button type="submit" className="btn">{f.id ? "Guardar cambios" : "Crear profesional"}</button>
        </div>
      </form>

      <h2>Profesionales ({profs.length})</h2>
      <ul className="lista-tarjetas">
        {profs.map((p) => (
          <li key={p.id_profesional} className="tarjeta">
            <h3>{p.nombre}</h3>
            <p className="meta">{p.especialidad} · {p.servicios.length === 0 ? "Sin servicios asignados" : servs.filter((s) => p.servicios.includes(s.id_servicio)).map((s) => s.nombre).join(", ")}</p>
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" onClick={() => { limpiar(); setF({ id: p.id_profesional, nombre: p.nombre, especialidad: p.especialidad, servicios: p.servicios }); window.scrollTo({ top: 0 }); }}>Editar</button>
              <button type="button" className="btn btn-secundario" onClick={() => setHorarioDe(p)}>Horario semanal</button>
              <button type="button" className="btn btn-secundario" onClick={() => setPorEliminar(p)}>Eliminar</button>
            </div>
          </li>
        ))}
      </ul>
      {porEliminar && <Confirmar titulo={`¿Eliminar a ${porEliminar.nombre}?`} texto="Solo se puede eliminar si no tiene citas ni cuenta de acceso." onNo={() => setPorEliminar(undefined)} onSi={() => void eliminar()} />}
      {horarioDe && <EditorHorario prof={horarioDe} cerrar={() => setHorarioDe(undefined)} ok={ok} />}
    </>
  );
}

function EditorHorario({ prof, cerrar, ok }: { prof: ProfesionalAdmin; cerrar: () => void; ok: (t: string) => void }) {
  const [v, setV] = useState<Ventana[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    get<Ventana[]>(`/api/admin/profesionales/${prof.id_profesional}/horario`)
      .then((x) => setV(x.map((w) => ({ ...w, desde: w.desde.slice(0, 5), hasta: w.hasta.slice(0, 5) }))))
      .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar el horario."));
  }, [prof.id_profesional]);

  async function guardar() {
    setError(undefined);
    try {
      await put(`/api/admin/profesionales/${prof.id_profesional}/horario`, { ventanas: v });
      ok(`Horario de ${prof.nombre} guardado.`);
      cerrar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos guardar el horario.");
    }
  }
  const cambiar = (i: number, c: Partial<Ventana>) => setV((x) => x!.map((w, j) => (j === i ? { ...w, ...c } : w)));

  return (
    <div className="modal-fondo" role="presentation">
      <div className="modal modal-ancho" role="dialog" aria-modal="true" aria-labelledby="t-hor">
        <h2 id="t-hor">Horario semanal · {prof.nombre}</h2>
        {error && <MensajeError>{error}</MensajeError>}
        {!v && !error && <Cargando />}
        {v && (
          <>
            {v.length === 0 && <p className="meta">Sin tramos: no recibirá reservas.</p>}
            {v.map((w, i) => (
              <div key={i} className="fila-horario">
                <select aria-label="Día" value={w.dia_semana} onChange={(e) => cambiar(i, { dia_semana: Number(e.target.value) })}>
                  {DIAS.map((d, n) => <option key={d} value={n}>{d}</option>)}
                </select>
                <input aria-label="Desde" type="time" value={w.desde} onChange={(e) => cambiar(i, { desde: e.target.value })} />
                <input aria-label="Hasta" type="time" value={w.hasta} onChange={(e) => cambiar(i, { hasta: e.target.value })} />
                <button type="button" className="btn btn-secundario btn-chico" onClick={() => setV(v.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" onClick={() => setV([...v, { dia_semana: 1, desde: "09:00", hasta: "13:00" }])}>+ Agregar tramo</button>
            </div>
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" onClick={cerrar}>Cancelar</button>
              <button type="button" className="btn" onClick={() => void guardar()}>Guardar horario</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Confirmar(p: { titulo: string; texto: string; onNo: () => void; onSi: () => void }) {
  return (
    <div className="modal-fondo" role="presentation">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="t-conf">
        <h2 id="t-conf">{p.titulo}</h2>
        <p>{p.texto}</p>
        <div className="barra-accion">
          <button type="button" className="btn btn-secundario" autoFocus onClick={p.onNo}>No</button>
          <button type="button" className="btn btn-peligro" onClick={p.onSi}>Sí, eliminar</button>
        </div>
      </div>
    </div>
  );
}
