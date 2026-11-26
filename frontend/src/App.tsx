import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import type { Rol } from "./api";
import { Cargando } from "./componentes/ui";
import { Layout } from "./componentes/Layout";
import { Servicios } from "./paginas/P1Servicios";
import { Horario } from "./paginas/P2Horario";
import { Datos } from "./paginas/P3Datos";
import { Resumen } from "./paginas/P4Resumen";
import { Pago } from "./paginas/P5Pago";
import { Confirmacion } from "./paginas/P6Confirmacion";
import { MisCitas } from "./paginas/P7MisCitas";
import { HorarioNoDisponible, PagoRechazado } from "./paginas/Errores";
import { Ingreso } from "./paginas/A1Ingreso";
import { Agenda } from "./paginas/A2Agenda";
import { Disponibilidad } from "./paginas/A3Disponibilidad";
import { Reportes } from "./paginas/A4Reportes";
import { Catalogo } from "./paginas/A5Catalogo";
import { Reprogramar } from "./paginas/P9Reprogramar";
import { Perfil } from "./paginas/P10Perfil";
import { PortafolioGestion } from "./paginas/PortafolioGestion";
import { Pagos } from "./paginas/Pagos";
import { Portafolio } from "./paginas/Portafolio";

/** Protege una ruta por rol. La verificación real siempre la hace la API; esto solo evita pantallas inútiles. */
function Protegida({ roles, children }: { roles: Rol[]; children: JSX.Element }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <Cargando />;
  if (!usuario) return <Navigate to="/ingreso" replace />;
  if (!roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Servicios />} />
        <Route path="horario" element={<Horario />} />
        <Route path="datos" element={<Datos />} />
        <Route path="resumen" element={<Protegida roles={["CLIENTA"]}><Resumen /></Protegida>} />
        <Route path="pago" element={<Protegida roles={["CLIENTA"]}><Pago /></Protegida>} />
        <Route path="pago-rechazado" element={<PagoRechazado />} />
        <Route path="no-disponible" element={<HorarioNoDisponible />} />
        <Route path="confirmacion/:id" element={<Protegida roles={["CLIENTA"]}><Confirmacion /></Protegida>} />
        <Route path="mis-citas" element={<Protegida roles={["CLIENTA"]}><MisCitas /></Protegida>} />
        <Route path="portafolio" element={<Portafolio />} />
        <Route path="ingreso" element={<Ingreso />} />
        <Route path="agenda" element={<Protegida roles={["PROFESIONAL", "ADMIN"]}><Agenda /></Protegida>} />
        <Route path="disponibilidad" element={<Protegida roles={["PROFESIONAL", "ADMIN"]}><Disponibilidad /></Protegida>} />
        <Route path="reportes" element={<Protegida roles={["ADMIN"]}><Reportes /></Protegida>} />
        <Route path="indicadores" element={<Navigate to="/reportes" replace />} />
        <Route path="catalogo" element={<Protegida roles={["ADMIN"]}><Catalogo /></Protegida>} />
        <Route path="reprogramar/:id" element={<Protegida roles={["CLIENTA"]}><Reprogramar /></Protegida>} />
        <Route path="perfil" element={<Protegida roles={["CLIENTA"]}><Perfil /></Protegida>} />
        <Route path="portafolio/gestion" element={<Protegida roles={["PROFESIONAL", "ADMIN"]}><PortafolioGestion /></Protegida>} />
        <Route path="pagos" element={<Protegida roles={["ADMIN"]}><Pagos /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
