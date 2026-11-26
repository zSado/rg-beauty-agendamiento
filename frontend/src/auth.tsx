import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get, post, type Usuario } from "./api";

interface Ctx {
  usuario: Usuario | null;
  cargando: boolean;
  refrescar: () => Promise<void>;
  salir: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      setUsuario(await get<Usuario>("/api/auth/yo"));
    } catch {
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  const salir = useCallback(async () => {
    try {
      await post("/api/auth/salir");
    } finally {
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const valor = useMemo(() => ({ usuario, cargando, refrescar, salir }), [usuario, cargando, refrescar, salir]);
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth fuera de AuthProvider");
  return c;
}
