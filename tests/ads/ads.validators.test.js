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

  describe("códigos FIPE opcionais (rodada de integração end-to-end)", () => {
    it("aceita fipe_brand_code/fipe_model_code/fipe_year_code/fipe_code/fipe_reference_month", () => {
      const data = validateCreateAdPayload({
        ...basePayload,
        fipe_brand_code: "23",
        fipe_model_code: "5585",
        fipe_year_code: "2018-1",
        fipe_code: "001234-5",
        fipe_reference_month: "maio de 2026",
        vehicle_type: "carros",
      });
      expect(data.fipe_brand_code).toBe("23");
      expect(data.fipe_model_code).toBe("5585");
      expect(data.fipe_year_code).toBe("2018-1");
      expect(data.fipe_code).toBe("001234-5");
      expect(data.fipe_reference_month).toBe("maio de 2026");
      expect(data.vehicle_type).toBe("carros");
    });

    it("rejeita vehicle_type fora do enum (carros/motos/caminhoes)", () => {
      expect(() =>
        validateCreateAdPayload({
          ...basePayload,
          vehicle_type: "navio",
        })
      ).toThrow();
    });

    it("aceita payload SEM nenhum código FIPE (backward-compat)", () => {
      const data = validateCreateAdPayload({ ...basePayload });
      expect(data.fipe_brand_code).toBeUndefined();
      expect(data.fipe_model_code).toBeUndefined();
      expect(data.fipe_year_code).toBeUndefined();
      expect(data.fipe_code).toBeUndefined();
      expect(data.fipe_reference_month).toBeUndefined();
    });
  });
});
