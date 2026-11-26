import { Query } from "mingo";
import type { Collection, Document } from "mongodb";
import { getMongoDb, mongoConfigurado } from "../db/mongo.js";

// Colección "portafolio" (MongoDB): trabajos de RG Beauty con imágenes, etiquetas y
// metadatos que cambian según el servicio. Referencia (no copia) a servicio y profesional
// de la base relacional mediante id_servicio e id_profesional.

export interface Portafolio {
  _id: string;
  id_servicio: number;
  id_profesional: number;
  titulo: string;
  descripcion: string;
  etiquetas: string[];
  imagenes: { url: string; alt: string }[];
  metadatos: Record<string, string | number | boolean>;
  publicado: boolean;
}

export interface FiltroPortafolio {
  publicado?: boolean;
  etiquetas?: string[];
  id_servicio?: number;
  id_profesional?: number;
}

/** Construye el filtro estilo MongoDB. Se usa igual en el repositorio real y en el de pruebas. */
export function construirFiltro(f: FiltroPortafolio): Document {
  const filtro: Document = {};
  if (f.publicado !== undefined) filtro.publicado = f.publicado;
  if (f.id_servicio !== undefined) filtro.id_servicio = f.id_servicio;
  if (f.id_profesional !== undefined) filtro.id_profesional = f.id_profesional;
  if (f.etiquetas && f.etiquetas.length > 0) filtro.etiquetas = { $in: f.etiquetas };
  return filtro;
}

export interface RepoPortafolio {
  asegurarIndices(): Promise<void>;
  listar(f: FiltroPortafolio): Promise<Portafolio[]>;
  obtener(id: string): Promise<Portafolio | undefined>;
  crear(doc: Portafolio): Promise<void>;
  actualizar(id: string, cambios: Partial<Omit<Portafolio, "_id">>): Promise<boolean>;
  eliminar(id: string): Promise<boolean>;
}

/** Implementación real sobre MongoDB (Atlas o local). */
export class RepoPortafolioMongo implements RepoPortafolio {
  private async col(): Promise<Collection<Portafolio>> {
    const db = await getMongoDb();
    return db.collection<Portafolio>("portafolio");
  }

  async asegurarIndices() {
    const c = await this.col();
    // Búsqueda pública: publicados por etiqueta; y portafolio por profesional.
    await c.createIndex({ publicado: 1, etiquetas: 1 });
    await c.createIndex({ id_profesional: 1, publicado: 1 });
    await c.createIndex({ id_servicio: 1 });
  }

  async listar(f: FiltroPortafolio) {
    const c = await this.col();
    return (await c.find(construirFiltro(f) as never).sort({ _id: 1 }).toArray()) as Portafolio[];
  }

  async obtener(id: string) {
    const c = await this.col();
    return ((await c.findOne({ _id: id } as never)) as Portafolio | null) ?? undefined;
  }

  async crear(doc: Portafolio) {
    const c = await this.col();
    await c.insertOne(doc as never);
  }

  async actualizar(id: string, cambios: Partial<Omit<Portafolio, "_id">>) {
    const c = await this.col();
    const r = await c.updateOne({ _id: id } as never, { $set: cambios } as never);
    return r.matchedCount === 1;
  }

  async eliminar(id: string) {
    const c = await this.col();
    const r = await c.deleteOne({ _id: id } as never);
    return r.deletedCount === 1;
  }
}

/**
 * Implementación en memoria que evalúa los MISMOS filtros con el motor de consultas de MongoDB (mingo).
 * Se usa solo en pruebas automáticas cuando no hay un servidor MongoDB disponible.
 */
export class RepoPortafolioMemoria implements RepoPortafolio {
  private docs: Portafolio[] = [];

  async asegurarIndices() {}

  async listar(f: FiltroPortafolio) {
    const q = new Query(construirFiltro(f));
    return this.docs.filter((d) => q.test(d)).sort((a, b) => a._id.localeCompare(b._id));
  }

  async obtener(id: string) {
    return this.docs.find((d) => d._id === id);
  }

  async crear(doc: Portafolio) {
    if (this.docs.some((d) => d._id === doc._id)) throw new Error("duplicado");
    this.docs.push(structuredClone(doc));
  }

  async actualizar(id: string, cambios: Partial<Omit<Portafolio, "_id">>) {
    const d = this.docs.find((x) => x._id === id);
    if (!d) return false;
    Object.assign(d, cambios);
    return true;
  }

  async eliminar(id: string) {
    const n = this.docs.length;
    this.docs = this.docs.filter((d) => d._id !== id);
    return this.docs.length < n;
  }
}

let repo: RepoPortafolio | undefined;
export function repoPortafolio(): RepoPortafolio {
  if (!repo) repo = new RepoPortafolioMongo();
  return repo;
}
let inyectado = false;
/** Permite inyectar otro repositorio (pruebas). */
export function usarRepoPortafolio(r: RepoPortafolio | undefined) {
  repo = r;
  inyectado = r !== undefined;
}

/** El portafolio funciona si hay MongoDB configurado (o un repositorio inyectado en pruebas). */
export function portafolioDisponible(): boolean {
  return inyectado || mongoConfigurado();
}
