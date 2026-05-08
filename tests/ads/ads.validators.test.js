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
  // Invariante a partir de 2026-05-08: anúncio active exige >=1 imagem
  // (ver ads.upload.constants + AD_STATUS). Payload base mínimo já passa.
  images: ["https://r2.example.com/ads/test/1.webp"],
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
