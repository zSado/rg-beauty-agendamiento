import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorApi, api, del, type Usuario } from "../api";
import { useAuth } from "../auth";
import { Campo, MensajeError, MensajeOk } from "../componentes/ui";

/** P10 · Mi perfil: actualizar datos y eliminar cuenta (solo si nunca tuvo citas). */
export function Perfil() {
  const { usuario, refrescar } = useAuth();
  const ir = useNavigate();
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    setError(undefined); setOk(false);
    try {
      await api<Usuario>("PUT", "/api/auth/yo", { nombre, telefono });
      setErrores({});
      setOk(true);
      await refrescar();
    } catch (e) {
      if (e instanceof ErrorApi) { setErrores(e.campos ?? {}); setError(e.message); } else setError("No pudimos guardar.");
    }
  }

  async function eliminar() {
    setConfirmar(false);
    try {
      await del("/api/auth/yo");
      await refrescar();
      ir("/", { replace: true });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos eliminar la cuenta.");
    }
  }

  return (
    <>
      <h1>Mi perfil</h1>
      <form onSubmit={guardar} noValidate className="formulario">
        <Campo id="correo" etiqueta="Correo" ayuda="El correo no se puede cambiar.">{(a) => <input {...a} value={usuario?.correo ?? ""} readOnly />}</Campo>
        <Campo id="nombre" etiqueta="Nombre" error={errores.nombre}>{(a) => <input {...a} value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} />}</Campo>
        <Campo id="tel" etiqueta="Teléfono" error={errores.telefono}>{(a) => <input {...a} type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />}</Campo>
        <button type="submit" className="btn">Guardar cambios</button>
      </form>
      {ok && <MensajeOk>Datos actualizados.</MensajeOk>}
      {error && <MensajeError>{error}</MensajeError>}
      <h2>Eliminar mi cuenta</h2>
      <p className="meta">Solo es posible si nunca has reservado una cita.</p>
      <button type="button" className="btn btn-peligro" onClick={() => setConfirmar(true)}>Eliminar mi cuenta</button>
      {confirmar && (
        <div className="modal-fondo" role="presentation">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="t-cu">
            <h2 id="t-cu">¿Eliminar tu cuenta?</h2>
            <p>Se borrarán tus datos. Esta acción no se puede deshacer.</p>
            <div className="barra-accion">
              <button type="button" className="btn btn-secundario" autoFocus onClick={() => setConfirmar(false)}>No, conservarla</button>
              <button type="button" className="btn btn-peligro" onClick={() => void eliminar()}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
