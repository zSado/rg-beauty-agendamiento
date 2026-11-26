import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorApi, get, type Servicio } from "../api";
import { Cargando, MensajeError, Pasos, Vacio } from "../componentes/ui";
import { pesos } from "../formato";
import { useReserva } from "../reserva";

/** P1 · Inicio y servicios */
export function Servicios() {
  const [lista, setLista] = useState<Servicio[] | null>(null);
  const [error, setError] = useState<string>();
  const { set } = useReserva();
  const ir = useNavigate();

  const cargar = useCallback(async () => {
    setError(undefined);
    setLista(null);
    try {
      setLista(await get<Servicio[]>("/api/servicios"));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos cargar los servicios.");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  function elegir(s: Servicio) {
    set({ servicio: s, profesional: undefined, fecha: undefined, hora: undefined, cita: undefined, venceEn: undefined });
    ir("/horario");
  }

  return (
    <>
      <Pasos actual={1} />
      <h1>Reserva tu hora</h1>
      <p className="lead">Elige un servicio. Tu cita queda confirmada al pagar un abono; el saldo se paga en el local.</p>
      {error && (
        <>
          <MensajeError>{error}</MensajeError>
          <button type="button" className="btn btn-secundario" onClick={() => void cargar()}>Reintentar</button>
        </>
      )}
      {!error && lista === null && <Cargando texto="Cargando servicios" />}
      {lista && lista.length === 0 && <Vacio titulo="Aún no hay servicios disponibles. Vuelve más tarde." />}
      {lista && lista.length > 0 && (
        <ul className="lista-tarjetas">
          {lista.map((s) => (
            <li key={s.id_servicio} className="tarjeta">
              <h2>{s.nombre}</h2>
              <p className="meta">{s.duracion_min} minutos</p>
              <p className="precio">{pesos(s.precio)}</p>
              <p className="meta">Abono para reservar: <strong>{pesos(s.monto_abono)}</strong> ({s.pct_abono} %)</p>
              <button type="button" className="btn" onClick={() => elegir(s)}>Reservar {s.nombre}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
