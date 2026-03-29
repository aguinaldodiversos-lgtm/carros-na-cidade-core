import { describe, it, expect } from "vitest";
import { validateCreateAdPayload } from "../../src/modules/ads/ads.validators.js";

const basePayload = {
  title: "Carro teste",
  price: 25000,
  city_id: 1,
  city: "Atibaia",
  state: "SP",
  brand: "VW",
  model: "Gol",
  year: 2020,
  mileage: 10000,
};

describe("validateCreateAdPayload", () => {
  it("normaliza rótulos PT-BR para slugs canônicos", () => {
    const data = validateCreateAdPayload({
      ...basePayload,
      body_type: "Sedã",
      fuel_type: "Flex",
      transmission: "Automático",
    });
    expect(data.body_type).toBe("sedan");
    expect(data.fuel_type).toBe("flex");
    expect(data.transmission).toBe("automatico");
  });

  it("rejeita payload base inválido", () => {
    expect(() =>
      validateCreateAdPayload({
        ...basePayload,
        title: "ab",
      })
    ).toThrow();
  });
});
