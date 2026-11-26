import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// En desarrollo, /api se reenvía a la API (mismo origen para el navegador: las cookies
// SameSite=Strict y el token CSRF funcionan sin configuración extra).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } },
  },
});
