import { describe, it, expect } from "vitest";
import {
  VEHICLE_IMAGE_MAX_FILES,
  VEHICLE_IMAGE_MAX_FILES_DEFAULT,
  VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES,
  VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES_DEFAULT,
} from "../../src/modules/ads/ads.upload.constants.js";

describe("ads.upload.constants — fonte única de limite de fotos", () => {
  it("define um teto positivo para arquivos por anúncio", () => {
    expect(Number.isInteger(VEHICLE_IMAGE_MAX_FILES)).toBe(true);
    expect(VEHICLE_IMAGE_MAX_FILES).toBeGreaterThan(0);
  });

  it("default explícito é 24 (alinhado ao maior plano + folga)", () => {
    expect(VEHICLE_IMAGE_MAX_FILES_DEFAULT).toBe(24);
  });

  it("default de tamanho por arquivo é 10 MB", () => {
    expect(VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES_DEFAULT).toBe(10 * 1024 * 1024);
    expect(VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES).toBeGreaterThan(0);
  });
});

describe("multer/validator/routes consomem a mesma constante", () => {
  it("Zod CreateAdSchema usa o mesmo teto", async () => {
    const { validateCreateAdPayload } = await import(
      "../../src/modules/ads/ads.validators.js"
    );

    const tooMany = Array.from(
      { length: VEHICLE_IMAGE_MAX_FILES + 1 },
      (_, i) => `https://r2.example/img-${i}.webp`
    );

    expect(() =>
      validateCreateAdPayload({
        title: "Teste",
        price: 1000,
        city_id: 1,
        city: "Atibaia",
        state: "SP",
        brand: "VW",
        model: "Gol",
        year: 2020,
        mileage: 0,
        images: tooMany,
      })
    ).toThrow();
  });

  it("Zod CreateAdSchema rejeita zero imagens (invariante mínima)", async () => {
    const { validateCreateAdPayload } = await import(
      "../../src/modules/ads/ads.validators.js"
    );
    expect(() =>
      validateCreateAdPayload({
        title: "Teste",
        price: 1000,
        city_id: 1,
        city: "Atibaia",
        state: "SP",
        brand: "VW",
        model: "Gol",
        year: 2020,
        mileage: 0,
        images: [],
      })
    ).toThrow();
  });
});
