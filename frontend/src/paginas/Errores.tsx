import { Link, useSearchParams } from "react-router-dom";
import { MensajeError } from "../componentes/ui";

/** E1 · Horario no disponible (otra clienta lo tomó antes) */
export function HorarioNoDisponible() {
  return (
    <section className="estado" role="alert">
      <div className="estado-icono" aria-hidden="true">⚠</div>
      <h1>Horario no disponible</h1>
      <p>Ese horario ya no está disponible. Elige otro y lo reservamos para ti.</p>
      <Link to="/horario" className="btn">Elegir otro horario</Link>
    </section>
  );
}

/** E2 · Pago rechazado. La reserva sigue retenida hasta que expire. */
export function PagoRechazado() {
  const [p] = useSearchParams();
  const id = p.get("cita");
  return (
    <section className="estado" role="alert">
      <div className="estado-icono" aria-hidden="true">⚠</div>
      <h1>No pudimos procesar tu pago</h1>
      <MensajeError>Tu pago fue rechazado. No se cobró nada. Tu horario sigue reservado mientras dure el plazo de 15 minutos.</MensajeError>
      <div className="barra-accion">
        {id && <Link to={`/pago?cita=${id}`} className="btn">Reintentar</Link>}
        <Link to="/resumen" className="btn btn-secundario">Volver al resumen</Link>
      </div>
    </section>
  );
}
