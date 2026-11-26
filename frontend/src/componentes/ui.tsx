import type { ReactNode } from "react";
import { ESTADOS } from "../formato";

/** Estado de carga (P2, P5, A4): indicador de progreso con texto. */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="estado" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{texto}</p>
    </div>
  );
}

/** Estado vacío (P1, P2, P7): texto claro y, si corresponde, una acción. */
export function Vacio({ icono = "🌸", titulo, children }: { icono?: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="estado" role="status">
      <div className="estado-icono" aria-hidden="true">{icono}</div>
      <p className="estado-titulo">{titulo}</p>
      {children}
    </div>
  );
}

/** Error: mensaje comprensible con ícono y texto (nunca solo color). */
export function MensajeError({ children }: { children: ReactNode }) {
  return (
    <div className="aviso aviso-error" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </div>
  );
}

export function MensajeOk({ children }: { children: ReactNode }) {
  return (
    <div className="aviso aviso-ok" role="status">
      <span aria-hidden="true">✔</span>
      <span>{children}</span>
    </div>
  );
}

export function MensajeInfo({ children }: { children: ReactNode }) {
  return (
    <div className="aviso aviso-info" role="note">
      <span aria-hidden="true">ℹ</span>
      <span>{children}</span>
    </div>
  );
}

/** Estado de una cita o pago: siempre ícono + texto + color. */
export function Insignia({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { texto: estado, icono: "•", clase: "neutro" };
  return (
    <span className={`insignia insignia-${e.clase}`}>
      <span aria-hidden="true">{e.icono}</span> {e.texto}
    </span>
  );
}

/** Campo de formulario: etiqueta visible, error bajo el campo con ícono y texto. */
export function Campo(props: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: (p: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const desc = props.error ? `${props.id}-error` : props.ayuda ? `${props.id}-ayuda` : undefined;
  return (
    <div className="campo">
      <label htmlFor={props.id}>{props.etiqueta}</label>
      {props.children({ id: props.id, "aria-invalid": Boolean(props.error), "aria-describedby": desc })}
      {props.ayuda && !props.error && <small id={`${props.id}-ayuda`} className="ayuda">{props.ayuda}</small>}
      {props.error && (
        <small id={`${props.id}-error`} className="error-campo" role="alert">
          <span aria-hidden="true">⚠</span> {props.error}
        </small>
      )}
    </div>
  );
}

export function Pasos({ actual }: { actual: 1 | 2 | 3 | 4 | 5 }) {
  const nombres = ["Servicio", "Horario", "Tus datos", "Resumen", "Pago"];
  return (
    <ol className="pasos" aria-label="Pasos de la reserva">
      {nombres.map((n, i) => (
        <li key={n} className={i + 1 === actual ? "activo" : i + 1 < actual ? "hecho" : ""} aria-current={i + 1 === actual ? "step" : undefined}>
          <span className="num">{i + 1}</span>
          <span className="txt">{n}</span>
        </li>
      ))}
    </ol>
  );
}
