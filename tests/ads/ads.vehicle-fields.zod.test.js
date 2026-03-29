import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  bodyTypeZodField,
  fuelTypeZodField,
  transmissionZodField,
} from "../../src/modules/ads/ads.vehicle-fields.zod.js";
import { FUEL_TYPES, TRANSMISSION_TYPES } from "../../src/modules/ads/ads.canonical.constants.js";

const createShape = z.object({
  body_type: bodyTypeZodField,
  fuel_type: fuelTypeZodField,
  transmission: transmissionZodField,
});

describe("ads.vehicle-fields.zod — preprocess + enum", () => {
  it("aceita rótulos PT-BR e resulta só em slugs canônicos ou null", () => {
    const r = createShape.safeParse({
      body_type: "Sedã",
      fuel_type: "Flex",
      transmission: "Automático",
    });
    expect(r.success).toBe(true);
    expect(r.data.body_type).toBe("sedan");
    expect(r.data.fuel_type).toBe("flex");
    expect(r.data.transmission).toBe("automatico");
  });

  it("combustível não mapeado vira null (não string solta)", () => {
    const r = createShape.safeParse({
      fuel_type: "combustivel-totalmente-desconhecido",
    });
    expect(r.success).toBe(true);
    expect(r.data.fuel_type).toBe(null);
  });

  it("listas canônicas cobrem z.enum", () => {
    expect(FUEL_TYPES.length).toBeGreaterThan(0);
    expect(TRANSMISSION_TYPES.length).toBeGreaterThan(0);
  });
});
