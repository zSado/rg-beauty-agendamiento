import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { ReservaProvider } from "./reserva";
import "./estilos.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ReservaProvider>
          <App />
        </ReservaProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
