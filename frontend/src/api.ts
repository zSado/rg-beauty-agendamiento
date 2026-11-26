// Cliente de la API. Las cookies de sesión son HttpOnly (el JavaScript no las ve);
// aquí solo se lee la cookie rg_csrf para enviarla en el encabezado x-csrf-token.

export class ErrorApi extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
    public campos?: Record<string, string>,
  ) {
    super(mensaje);
  }
}

function leerCsrf(): string {
  const m = /(?:^|; )rg_csrf=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]!) : "";
}

async function enviar(metodo: string, url: string, cuerpo?: unknown): Promise<Response> {
  const cabeceras: Record<string, string> = {};
  if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";
  if (metodo !== "GET") cabeceras["x-csrf-token"] = leerCsrf();
  return fetch(url, {
    method: metodo,
    headers: cabeceras,
    credentials: "same-origin",
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

let renovando: Promise<boolean> | undefined;
async function renovarSesion(): Promise<boolean> {
  renovando ??= enviar("POST", "/api/auth/renovar", {})
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      renovando = undefined;
    });
  return renovando;
}

export async function api<T = unknown>(metodo: string, url: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await enviar(metodo, url, cuerpo);
    // Si venció el token de acceso (15 min), se renueva una vez y se reintenta
    if (r.status === 401 && !url.startsWith("/api/auth/") && (await renovarSesion())) {
      r = await enviar(metodo, url, cuerpo);
    }
  } catch {
    throw new ErrorApi(0, "SIN_CONEXION", "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.");
  }
  if (r.status === 204) return undefined as T;
  const json = await r.json().catch(() => undefined);
  if (!r.ok) {
    const e = json?.error;
    throw new ErrorApi(r.status, e?.codigo ?? "ERROR", e?.mensaje ?? "Algo salió mal. Inténtalo de nuevo.", e?.campos);
  }
  return json as T;
}

export const get = <T,>(url: string) => api<T>("GET", url);
export const post = <T,>(url: string, cuerpo?: unknown) => api<T>("POST", url, cuerpo ?? {});
export const put = <T,>(url: string, cuerpo?: unknown) => api<T>("PUT", url, cuerpo ?? {});
export const del = <T,>(url: string) => api<T>("DELETE", url);

// ---- Tipos ----
export type Rol = "CLIENTA" | "PROFESIONAL" | "ADMIN";
export interface Usuario {
  id_usuario: number;
  rol: Rol;
  id_profesional: number | null;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
}
export interface Servicio {
  id_servicio: number;
  nombre: string;
  precio: number;
  duracion_min: number;
  pct_abono: number;
  monto_abono: number;
  saldo: number;
}
export interface Profesional {
  id_profesional: number;
  nombre: string;
  especialidad: string;
}
export type EstadoCita = "PENDIENTE_PAGO" | "CONFIRMADA" | "CANCELADA" | "EXPIRADA";
export interface Cita {
  id_cita: number;
  id_cliente: number;
  id_servicio: number;
  id_profesional: number;
  fecha_hora: string;
  fecha_hora_fin: string;
  estado: EstadoCita;
  monto_abono: number;
  segundos_restantes: number | null;
}
export interface CitaDetalle extends Cita {
  servicio: string;
  profesional: string;
  cliente: string;
  precio: number;
  pagado: number;
}
export interface Bloqueo {
  id_bloqueo: number;
  id_profesional: number;
  inicio: string;
  fin: string;
  motivo: string | null;
  citas_activas_en_bloqueo?: number;
}
export interface Indicadores {
  desde: string;
  hasta: string;
  ocupacion_pct: number;
  cancelacion_pct: number;
  tiempo_muerto_min: number;
  traslapes: number;
  citas_confirmadas: number;
  citas_canceladas: number;
}
export interface PortafolioItem {
  _id: string;
  titulo: string;
  descripcion: string;
  etiquetas: string[];
  imagenes: { url: string; alt: string }[];
  metadatos: Record<string, string | number | boolean>;
}

export interface ProfesionalAdmin extends Profesional {
  servicios: number[];
}
export interface Ventana {
  dia_semana: number;
  desde: string;
  hasta: string;
}
export interface ReporteCitas {
  filas: CitaDetalle[];
  totales: { cantidad: number; abono_pagado: number; abono_pendiente: number };
  limitado: boolean;
}
export interface PortafolioGestion extends PortafolioItem {
  id_servicio: number;
  id_profesional: number;
  publicado: boolean;
}
