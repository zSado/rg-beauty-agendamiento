import { MongoClient, type Db } from "mongodb";
import { env } from "../config/env.js";

let cliente: MongoClient | undefined;

export function mongoConfigurado(): boolean {
  return Boolean(env.MONGO_URI);
}

export async function getMongoDb(): Promise<Db> {
  if (!env.MONGO_URI) throw new Error("MONGO_URI no está configurada");
  if (!cliente) {
    cliente = new MongoClient(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await cliente.connect();
  }
  return cliente.db(env.MONGO_DB);
}

export async function cerrarMongo(): Promise<void> {
  if (cliente) {
    await cliente.close();
    cliente = undefined;
  }
}
