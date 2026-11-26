import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ErrorApi, post } from "../api";
import { useAuth } from "../auth";
import { Campo, Cargando, MensajeError, MensajeInfo, Pasos } from "../componentes/ui";
import { useReserva } from "../reserva";

type Errores = Record<string, string>;

function validarRegistro(d: { nombre: string; correo: string; telefono: string; clave: string }): Errores {
  const e: Errores = {};
  if (d.nombre.trim().length < 2) e.nombre = "Ingresa tu nombre";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo.trim())) e.correo = "Ingresa un correo válido, por ejemplo nombre@correo.cl";
  if (!/^\+?[0-9 ]{8,15}$/.test(d.telefono.trim())) e.telefono = "Ingresa un teléfono válido, por ejemplo +56 9 1234 5678";
  if (d.clave.length < 10) e.clave = "La contraseña debe tener al menos 10 caracteres";
  return e;
}

/** P3 · Datos de la clienta (crear cuenta o ingresar) */
export function Datos() {
  const { usuario, cargando, refrescar } = useAuth();
  const { r } = useReserva();
  const ir = useNavigate();
  const [modo, setModo] = useState<"registro" | "ingreso">("registro");
  const [d, setD] = useState({ nombre: "", correo: "", telefono: "", clave: "" });
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  if (!r.servicio || !r.hora) return <Navigate to="/" replace />;
  if (cargando) return <Cargando />;
  if (usuario?.rol === "CLIENTA") return <Navigate to="/resumen" replace />;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErrorGeneral(undefined);
    let e: Errores = {};
    if (modo === "registro") e = validarRegistro(d);
    else {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo.trim())) e.correo = "Ingresa un correo válido";
      if (!d.clave) e.clave = "Ingresa tu contraseña";
    }
    setErrores(e);
    if (Object.keys(e).length > 0) return;

    setEnviando(true);
    try {
      if (modo === "registro") await post("/api/auth/registro", d);
      else await post("/api/auth/login", { correo: d.correo, clave: d.clave });
      await refrescar();
      ir("/resumen");
    } catch (x) {
      if (x instanceof ErrorApi) {
        if (x.campos) setErrores(x.campos);
        setErrorGeneral(x.message);
      } else setErrorGeneral("Algo salió mal. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Pasos actual={3} />
      <h1>Tus datos</h1>
      {usuario && <MensajeInfo>Estás con una cuenta de personal. Para reservar como clienta, cierra sesión e ingresa con tu cuenta de clienta.</MensajeInfo>}
      <div className="pestanas" role="tablist" aria-label="Tipo de acceso">
        <button type="button" role="tab" aria-selected={modo === "registro"} className={modo === "registro" ? "act" : ""} onClick={() => { setModo("registro"); setErrores({}); setErrorGeneral(undefined); }}>Crear cuenta</button>
        <button type="button" role="tab" aria-selected={modo === "ingreso"} className={modo === "ingreso" ? "act" : ""} onClick={() => { setModo("ingreso"); setErrores({}); setErrorGeneral(undefined); }}>Ya tengo cuenta</button>
      </div>

      <form onSubmit={enviar} noValidate className="formulario">
        {errorGeneral && <MensajeError>{errorGeneral}</MensajeError>}
        {modo === "registro" && (
          <>
            <Campo id="nombre" etiqueta="Nombre completo" error={errores.nombre}>
              {(a) => <input {...a} autoComplete="name" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} maxLength={100} />}
            </Campo>
            <Campo id="telefono" etiqueta="Teléfono" error={errores.telefono} ayuda="Con código de país, por ejemplo +56 9 1234 5678">
              {(a) => <input {...a} type="tel" autoComplete="tel" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />}
            </Campo>
          </>
        )}
        <Campo id="correo" etiqueta="Correo" error={errores.correo}>
          {(a) => <input {...a} type="email" autoComplete="email" value={d.correo} onChange={(e) => setD({ ...d, correo: e.target.value })} maxLength={120} />}
        </Campo>
        <Campo id="clave" etiqueta="Contraseña" error={errores.clave} ayuda={modo === "registro" ? "Mínimo 10 caracteres" : undefined}>
          {(a) => <input {...a} type="password" autoComplete={modo === "registro" ? "new-password" : "current-password"} value={d.clave} onChange={(e) => setD({ ...d, clave: e.target.value })} maxLength={100} />}
        </Campo>
        <div className="barra-accion">
          <button type="button" className="btn btn-secundario" onClick={() => ir("/horario")}>Volver</button>
          <button type="submit" className="btn" disabled={enviando}>{enviando ? "Un momento…" : modo === "registro" ? "Crear cuenta y continuar" : "Ingresar y continuar"}</button>
        </div>
      </form>
    </>
  );
}
