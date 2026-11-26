import argon2 from "argon2";

// Contraseñas con Argon2id (sección 7.1). Nunca se guardan ni se registran en texto plano.
const OPCIONES: argon2.Options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashearClave(clave: string): Promise<string> {
  return argon2.hash(clave, OPCIONES);
}

export async function verificarClave(hash: string, clave: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, clave);
  } catch {
    return false;
  }
}

let falso: Promise<string> | undefined;
/** Hash de relleno para gastar el mismo tiempo cuando el correo no existe (evita enumerar cuentas). */
export function hashFalso(): Promise<string> {
  falso ??= hashearClave("clave-de-relleno-no-valida");
  return falso;
}
