import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorApi, post, type Rol } from "../api";
import { useAuth } from "../auth";
import { Campo, MensajeError } from "../componentes/ui";

/** A1 · Inicio de sesión (clientas, profesionales y administración) */
export function Ingreso() {
  const { refrescar } = useAuth();
  const ir = useNavigate();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setError(undefined);
    const e: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) e.correo = "Ingresa un correo válido";
    if (!clave) e.clave = "Ingresa tu contraseña";
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setEnviando(true);
    try {
      const u = await post<{ rol: Rol }>("/api/auth/login", { correo, clave });
      await refrescar();
      ir(u.rol === "CLIENTA" ? "/mis-citas" : "/agenda");
    } catch (x) {
      setError(x instanceof ErrorApi ? x.message : "Algo salió mal. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Ingresar</h1>
      <form onSubmit={enviar} noValidate className="formulario angosto">
        {error && <MensajeError>{error}</MensajeError>}
        <Campo id="correo" etiqueta="Correo" error={errores.correo}>
          {(a) => <input {...a} type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} />}
        </Campo>
        <Campo id="clave" etiqueta="Contraseña" error={errores.clave}>
          {(a) => <input {...a} type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />}
        </Campo>
        <button type="submit" className="btn" disabled={enviando}>{enviando ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </>
  );
}
