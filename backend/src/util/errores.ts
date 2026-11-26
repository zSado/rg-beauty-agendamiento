// Errores de negocio. El mensaje es apto para mostrar a la clienta (sin detalles técnicos).
export class ErrorNegocio extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly estadoHttp = 400,
  ) {
    super(mensaje);
  }
}

export class HorarioNoDisponible extends ErrorNegocio {
  constructor(mensaje = "Ese horario ya no está disponible. Elige otro y lo reservamos para ti.") {
    super("HORARIO_NO_DISPONIBLE", mensaje, 409);
  }
}

export class PagoInvalido extends ErrorNegocio {
  constructor(mensaje = "El pago no es válido.") {
    super("PAGO_INVALIDO", mensaje, 422);
  }
}

export class NoEncontrado extends ErrorNegocio {
  constructor(mensaje = "No encontramos lo que buscas.") {
    super("NO_ENCONTRADO", mensaje, 404);
  }
}

export class Prohibido extends ErrorNegocio {
  constructor(mensaje = "No tienes permiso para hacer esto.") {
    super("PROHIBIDO", mensaje, 403);
  }
}

export class NoAutenticado extends ErrorNegocio {
  constructor(mensaje = "Inicia sesión para continuar.") {
    super("NO_AUTENTICADO", mensaje, 401);
  }
}
