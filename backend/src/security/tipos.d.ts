import type { SesionToken } from "./tokens.js";

declare global {
  namespace Express {
    interface Request {
      sesion?: SesionToken;
    }
  }
}
export {};
