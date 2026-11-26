import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErrorApi, del, get, post, put, type PortafolioGestion as Item, type Servicio } from "../api";
import { Campo, Cargando, MensajeError, MensajeOk, Vacio } from "../componentes/ui";

/** Gestión del portafolio (MongoDB): crear, editar, publicar y eliminar trabajos. */
export function PortafolioGestion() {
  const vacio = { id: "", servicio: "", titulo: "", descripcion: "", etiquetas: "", url: "", alt: "", publicado: true };
  const [items, setItems] = useState<Item[] | null>(null);
  const [servs, setServs] = useState<Servicio[]>([]);
  const [f, setF] = useState(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<string>();

  const cargar = useCallback(async () => {
    try { setItems(await get<Item[]>("/api/portafolio/gestion")); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : "No pudimos cargar tus trabajos."); setItems([]); }
  }, []);
  useEffect(() => { void cargar(); get<Servicio[]>("/api/servicios").then(setServs).catch(() => undefined); }, [cargar]);

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    setError(undefined); setOk(undefined);
    const e: Record<string, string> = {};
    if (!f.servicio) e.servicio = "Elige un servicio";
    if (f.titulo.trim().length < 3) e.titulo = "Mínimo 3 caracteres";
    if (f.url && !/^https:\/\//.test(f.url)) e.url = "La dirección debe comenzar con https://";
    if (f.url && f.alt.trim().length < 3) e.alt = "Describe la imagen";
    setErrores(e);
    if (Object.keys(e).length) return;
    const cuerpo = {
      id_servicio: Number(f.servicio), titulo: f.titulo.trim(), descripcion: f.descripcion.trim(),
      etiquetas: f.etiquetas.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      imagenes: f.url ? [{ url: f.url.trim(), alt: f.alt.trim() }] : [], publicado: f.publicado,
    };
    try {
      if (f.id) await put(`/api/portafolio/gestion/${f.id}`, cuerpo); else await post("/api/portafolio/gestion", cuerpo);
      setOk(f.id ? "Trabajo actualizado." : "Trabajo creado.");
      setF(vacio);
      await cargar();
    } catch (x) { setError(x instanceof ErrorApi ? x.message : "No pudimos guardar."); }
  }

  async function eliminar(i: Item) {
    setError(undefined); setOk(undefined);
    try { await del(`/api/portafolio/gestion/${i._id}`); setOk("Trabajo eliminado."); await cargar(); }
    catch (x) { setError(x instanceof ErrorApi ? x.message : "No pudimos eliminar."); }
  }

  return (
    <>
      <h1>Mis trabajos (portafolio)</h1>
      <form onSubmit={guardar} noValidate className="formulario">
        <h2>{f.id ? "Editar trabajo" : "Nuevo trabajo"}</h2>
        <Campo id="g-serv" etiqueta="Servicio" error={errores.servicio}>
          {(a) => <select {...a} value={f.servicio} onChange={(e) => setF({ ...f, servicio: e.target.value })}><option value="">Elige…</option>{servs.map((s) => <option key={s.id_servicio} value={s.id_servicio}>{s.nombre}</option>)}</select>}
        </Campo>
        <Campo id="g-tit" etiqueta="Título" error={errores.titulo}>{(a) => <input {...a} maxLength={120} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />}</Campo>
        <Campo id="g-desc" etiqueta="Descripción">{(a) => <textarea {...a} maxLength={500} rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />}</Campo>
        <Campo id="g-etq" etiqueta="Etiquetas" ayuda="Separadas por coma. Ej: manicure, nude">{(a) => <input {...a} value={f.etiquetas} onChange={(e) => setF({ ...f, etiquetas: e.target.value })} />}</Campo>
        <Campo id="g-url" etiqueta="Dirección de la imagen (https)" error={errores.url}>{(a) => <input {...a} type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />}</Campo>
        <Campo id="g-alt" etiqueta="Descripción de la imagen" error={errores.alt}>{(a) => <input {...a} maxLength={150} value={f.alt} onChange={(e) => setF({ ...f, alt: e.target.value })} />}</Campo>
        <label className="check"><input type="checkbox" checked={f.publicado} onChange={(e) => setF({ ...f, publicado: e.target.checked })} /> Publicado (visible para las clientas)</label>
        <div className="barra-accion">
          {f.id && <button type="button" className="btn btn-secundario" onClick={() => { setF(vacio); setErrores({}); }}>Cancelar edición</button>}
          <button type="submit" className="btn">{f.id ? "Guardar cambios" : "Crear trabajo"}</button>
        </div>
      </form>
      {ok && <MensajeOk>{ok}</MensajeOk>}
      {error && <MensajeError>{error}</MensajeError>}
      {!items && <Cargando />}
      {items && items.length === 0 && <Vacio titulo="Aún no hay trabajos" />}
      {items && items.length > 0 && (
        <ul className="lista-tarjetas">
          {items.map((i) => (
            <li key={i._id} className="tarjeta">
              <h2>{i.titulo}</h2>
              <p className="meta">{i.publicado ? "✔ Publicado" : "⏸ Borrador"} · {i.etiquetas.map((t) => `#${t}`).join(" ")}</p>
              <div className="barra-accion">
                <button type="button" className="btn btn-secundario" onClick={() => { setOk(undefined); setF({ id: i._id, servicio: String(i.id_servicio), titulo: i.titulo, descripcion: i.descripcion, etiquetas: i.etiquetas.join(", "), url: i.imagenes[0]?.url ?? "", alt: i.imagenes[0]?.alt ?? "", publicado: i.publicado }); window.scrollTo({ top: 0 }); }}>Editar</button>
                <button type="button" className="btn btn-secundario" onClick={() => void eliminar(i)}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
