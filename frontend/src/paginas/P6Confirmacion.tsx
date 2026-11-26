import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorApi, get, type CitaDetalle } from "../api";
import { Cargando, Insignia, MensajeError } from "../componentes/ui";
import { fechaLarga, pesos, soloFecha, soloHora } from "../formato";
import { useReserva } from "../reserva";

/** P6 · Confirmación */
export function Confirmacion() {
  const { id } = useParams();
  const [cita, setCita] = useState<CitaDetalle>();
  const [error, setError] = useState<string>();
  const { reiniciar } = useReserva();

  useEffect(() => {
    get<CitaDetalle>(`/api/citas/${id}`)
      .then((c) => {
        setCita(c);
        if (c.estado === "CONFIRMADA") reiniciar();
      })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar tu comprobante."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <MensajeError>{error}</MensajeError>;
  if (!cita) return <Cargando texto="Cargando tu comprobante" />;

  return (
    <>
      <div className="exito" role="status">
        <div className="exito-icono" aria-hidden="true">✔</div>
        <h1>{cita.estado === "CONFIRMADA" ? "Cita confirmada" : "Tu cita aún no está confirmada"}</h1>
        {cita.estado === "CONFIRMADA" && <p>Pagaste el abono y tu horario es tuyo. ¡Te esperamos!</p>}
      </div>
      <section className="panel" aria-labelledby="t-c">
        <h2 id="t-c">Comprobante</h2>
        <dl className="resumen">
          <dt>Estado</dt><dd><Insignia estado={cita.estado} /></dd>
          <dt>N.º de cita</dt><dd>{cita.id_cita}</dd>
          <dt>Servicio</dt><dd>{cita.servicio}</dd>
          <dt>Profesional</dt><dd>{cita.profesional}</dd>
          <dt>Día y hora</dt><dd>{fechaLarga(soloFecha(cita.fecha_hora))}, {soloHora(cita.fecha_hora)}</dd>
          <dt>Abono pagado</dt><dd>{pesos(cita.pagado)}</dd>
          <dt>Saldo pendiente (en el local)</dt><dd>{pesos(cita.precio - cita.pagado)}</dd>
        </dl>
      </section>
      <div className="barra-accion">
        <Link to="/mis-citas" className="btn">Ir a Mis citas</Link>
        <Link to="/" className="btn btn-secundario">Reservar otra hora</Link>
      </div>
    </>
  );
}
