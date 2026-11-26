import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useReserva } from "../reserva";

export function Layout() {
  const { usuario, salir } = useAuth();
  const { reiniciar } = useReserva();
  const ir = useNavigate();
  const staff = usuario?.rol === "PROFESIONAL" || usuario?.rol === "ADMIN";

  async function cerrar() {
    await salir();
    reiniciar();
    ir("/");
  }

  return (
    <>
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      <header className="cabecera">
        <div className="cabecera-in">
          <Link to="/" className="logo">RG Beauty Spa</Link>
          <nav aria-label="Principal">
            <NavLink to="/">Reservar</NavLink>
            <NavLink to="/portafolio">Portafolio</NavLink>
            {usuario?.rol === "CLIENTA" && <NavLink to="/mis-citas">Mis citas</NavLink>}
            {usuario?.rol === "CLIENTA" && <NavLink to="/perfil">Mi perfil</NavLink>}
            {staff && <NavLink to="/agenda">Agenda</NavLink>}
            {staff && <NavLink to="/disponibilidad">Disponibilidad</NavLink>}
            {staff && <NavLink to="/portafolio/gestion">Mis trabajos</NavLink>}
            {usuario?.rol === "ADMIN" && <NavLink to="/reportes">Reportes</NavLink>}
            {usuario?.rol === "ADMIN" && <NavLink to="/catalogo">Catálogo</NavLink>}
            {usuario?.rol === "ADMIN" && <NavLink to="/pagos">Pagos</NavLink>}
            {usuario ? (
              <button type="button" className="enlace" onClick={cerrar}>Salir</button>
            ) : (
              <NavLink to="/ingreso">Ingresar</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main id="contenido" className="contenido">
        <Outlet />
      </main>
      <footer className="pie">
        <p>RG Beauty Spa · Módulo de agendamiento y pago de abono. Datos y pasarela de pago de demostración.</p>
      </footer>
    </>
  );
}
