import { useEffect, useState } from "react";
import { ErrorApi, get, type PortafolioItem } from "../api";
import { Campo, Cargando, MensajeError, Vacio } from "../componentes/ui";

/** Portafolio de trabajos (datos no estructurados, MongoDB). */
export function Portafolio() {
  const [etiqueta, setEtiqueta] = useState("");
  const [items, setItems] = useState<PortafolioItem[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let activo = true;
    setItems(null);
    setError(undefined);
    const q = etiqueta.trim() ? `?etiqueta=${encodeURIComponent(etiqueta.trim().toLowerCase())}` : "";
    const t = setTimeout(() => {
      get<PortafolioItem[]>(`/api/portafolio${q}`)
        .then((x) => activo && setItems(x))
        .catch((e) => activo && setError(e instanceof ErrorApi ? e.message : "No pudimos cargar el portafolio."));
    }, 250);
    return () => {
      activo = false;
      clearTimeout(t);
    };
  }, [etiqueta]);

  return (
    <>
      <h1>Portafolio</h1>
      <p className="lead">Algunos de nuestros trabajos.</p>
      <div className="filtros">
        <Campo id="etq" etiqueta="Buscar por etiqueta" ayuda="Por ejemplo: manicure, facial">
          {(a) => <input {...a} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} maxLength={30} />}
        </Campo>
      </div>
      {error && <MensajeError>{error}</MensajeError>}
      {!items && !error && <Cargando texto="Cargando portafolio" />}
      {items && items.length === 0 && <Vacio titulo="No encontramos trabajos con esa etiqueta" />}
      {items && items.length > 0 && (
        <ul className="lista-tarjetas">
          {items.map((i) => (
            <li key={i._id} className="tarjeta">
              <h2>{i.titulo}</h2>
              {i.imagenes.map((im) => <img key={im.url} src={im.url} alt={im.alt} loading="lazy" className="foto" />)}
              <p>{i.descripcion}</p>
              <p className="meta">{i.etiquetas.map((t) => `#${t}`).join("  ")}</p>
              {Object.keys(i.metadatos).length > 0 && (
                <dl className="resumen">
                  {Object.entries(i.metadatos).map(([k, v]) => (<span key={k} style={{ display: "contents" }}><dt>{k.replace(/_/g, " ")}</dt><dd>{String(v)}</dd></span>))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
