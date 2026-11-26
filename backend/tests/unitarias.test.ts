import { describe, expect, it } from "vitest";
import { calcularAbono } from "../src/domain/abono.js";
import { horasLibres, seTraslapan, tiempoMuertoMin } from "../src/domain/horarios.js";
import { esquemaPortafolio, esquemaRegistro } from "../src/routes/esquemas.js";
import { esFechaHoraValida, sumarMinutos } from "../src/util/fechas.js";

describe("PU-01..03 calcularAbono (RN-01)", () => {
  it("PU-01 abono del 20 % de 30.000 es 6.000", () => {
    expect(calcularAbono(30000, 20)).toBe(6000);
  });
  it("PU-02 redondea al peso más cercano: 33.333 al 20 % = 6.667", () => {
    expect(calcularAbono(33333, 20)).toBe(6667);
  });
  it.each([
    [0, 20],
    [-100, 20],
    [30000, 101],
    [30000, -1],
    [100.5, 20],
  ])("PU-03 rechaza datos inválidos (precio %i, porcentaje %i)", (precio, pct) => {
    expect(() => calcularAbono(precio, pct)).toThrow(RangeError);
  });
  it("PU-04 abono 0 % y 100 % (límites)", () => {
    expect(calcularAbono(30000, 0)).toBe(0);
    expect(calcularAbono(30000, 100)).toBe(30000);
  });
});

describe("horarios y traslapes (RN-02)", () => {
  it("PU-05 detecta traslape parcial y no lo detecta si solo se tocan los bordes", () => {
    const base = { inicio: "2026-11-10T10:00", fin: "2026-11-10T11:00" };
    expect(seTraslapan(base, { inicio: "2026-11-10T10:30", fin: "2026-11-10T11:30" })).toBe(true);
    expect(seTraslapan(base, { inicio: "2026-11-10T11:00", fin: "2026-11-10T12:00" })).toBe(false);
  });
  it("PU-06 horasLibres respeta duración, ocupados y horas pasadas", () => {
    const horas = horasLibres({
      fecha: "2026-11-10",
      ventanas: [{ desde: "09:00", hasta: "13:00" }],
      duracionMin: 60,
      ocupados: [{ inicio: "2026-11-10T10:00", fin: "2026-11-10T11:00" }],
      ahoraLocal: "2026-11-10T08:00",
    });
    expect(horas).toEqual(["09:00", "11:00", "11:30", "12:00"]);
    const sinPasadas = horasLibres({
      fecha: "2026-11-10", ventanas: [{ desde: "09:00", hasta: "11:00" }], duracionMin: 60, ocupados: [],
      ahoraLocal: "2026-11-10T09:00",
    });
    expect(sinPasadas).toEqual(["09:30", "10:00"]);
  });
  it("PU-07 tiempo muerto suma solo los huecos entre citas", () => {
    expect(
      tiempoMuertoMin([
        { inicio: "2026-11-10T10:00", fin: "2026-11-10T11:00" },
        { inicio: "2026-11-10T12:00", fin: "2026-11-10T13:00" },
        { inicio: "2026-11-10T13:00", fin: "2026-11-10T14:00" },
        { inicio: "2026-11-10T14:30", fin: "2026-11-10T15:00" },
      ]),
    ).toBe(90);
  });
  it("PU-08 fechas: sumar minutos y validar formato", () => {
    expect(sumarMinutos("2026-11-10T23:30", 60)).toBe("2026-11-11T00:30");
    expect(esFechaHoraValida("2026-02-30T10:00")).toBe(false);
    expect(esFechaHoraValida("2026-11-10T10:00")).toBe(true);
  });
});

describe("validación de entradas en servidor (sección 7.3)", () => {
  it("PU-09 registro: rechaza correo, teléfono y clave inválidos con mensaje por campo", () => {
    const r = esquemaRegistro.safeParse({ nombre: "A", correo: "no-es-correo", telefono: "abc", clave: "corta" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const campos = r.error.issues.map((i) => i.path[0]);
      expect(campos).toEqual(expect.arrayContaining(["nombre", "correo", "telefono", "clave"]));
    }
  });
  it("PS-06 portafolio: imagen debe ser https y llevar texto alternativo (A13/A7)", () => {
    const base = { id_servicio: 1, titulo: "Trabajo de prueba", publicado: true };
    expect(esquemaPortafolio.safeParse({ ...base, imagenes: [{ url: "javascript:alert(1)", alt: "x" }] }).success).toBe(false);
    expect(esquemaPortafolio.safeParse({ ...base, imagenes: [{ url: "http://sitio.cl/a.jpg", alt: "Descripción" }] }).success).toBe(false);
    expect(esquemaPortafolio.safeParse({ ...base, imagenes: [{ url: "https://sitio.cl/a.jpg", alt: "" }] }).success).toBe(false);
    expect(esquemaPortafolio.safeParse({ ...base, imagenes: [{ url: "https://sitio.cl/a.jpg", alt: "Manos con esmalte" }] }).success).toBe(true);
  });
});
