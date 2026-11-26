import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Cita, Profesional, Servicio } from "./api";

// Estado del recorrido de reserva (P1 a P6). Se guarda en sessionStorage para sobrevivir a una
// recarga; si el navegador lo bloquea, la reserva igual funciona en memoria.
export interface EstadoReserva {
  servicio?: Servicio;
  profesional?: Profesional;
  fecha?: string;
  hora?: string;
  cita?: Cita;
  /** Momento (ms) en que vence la retención, calculado con los segundos que informa el servidor. */
  venceEn?: number;
}

interface Ctx {
  r: EstadoReserva;
  set: (cambios: Partial<EstadoReserva>) => void;
  reiniciar: () => void;
}
const ReservaCtx = createContext<Ctx | null>(null);
const CLAVE = "rg_reserva";

function leer(): EstadoReserva {
  try {
    const t = sessionStorage.getItem(CLAVE);
    return t ? (JSON.parse(t) as EstadoReserva) : {};
  } catch {
    return {};
  }
}

export function ReservaProvider({ children }: { children: ReactNode }) {
  const [r, setR] = useState<EstadoReserva>(leer);

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(r));
    } catch {
      /* sin almacenamiento: se sigue en memoria */
    }
  }, [r]);

  const valor = useMemo<Ctx>(
    () => ({
      r,
      set: (c) => setR((a) => ({ ...a, ...c })),
      reiniciar: () => setR({}),
    }),
    [r],
  );
  return <ReservaCtx.Provider value={valor}>{children}</ReservaCtx.Provider>;
}

export function useReserva(): Ctx {
  const c = useContext(ReservaCtx);
  if (!c) throw new Error("useReserva fuera de ReservaProvider");
  return c;
}
