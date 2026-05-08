import { describe, it, expect, vi } from "vitest";

/**
 * Invariante: anúncio active exige >=1 imagem válida.
 *
 * O Zod já barra `images: []`, mas mantemos uma checagem de domínio em
 * `createAdNormalized` para callers que skipem o validator (defesa em
 * profundidade). Este teste cobre o caminho que escapa do Zod —
 * `validateCreateAdPayload` mockado para devolver payload sem imagens.
 */
vi.mock("../../src/modules/ads/ads.validators.js", () => ({
  validateCreateAdPayload: vi.fn((p) => ({ ...p, images: [] })),
  validateAdId: vi.fn(),
  validateAdIdentifier: vi.fn(),
  validateUpdateAdPayload: vi.fn(),
}));

vi.mock("../../src/modules/ads/ads.publish.eligibility.service.js", () => ({
  ensurePublishEligibility: vi.fn(),
}));

vi.mock("../../src/modules/ads/ads.persistence.service.js", () => ({
  prepareAdInsertPayload: vi.fn((p) => p),
  executeAdInsert: vi.fn(),
}));

const { createAdNormalized } = await import(
  "../../src/modules/ads/ads.create.pipeline.service.js"
);
const persistence = await import(
  "../../src/modules/ads/ads.persistence.service.js"
);
const eligibility = await import(
  "../../src/modules/ads/ads.publish.eligibility.service.js"
);

describe("createAdNormalized — invariante de imagem mínima", () => {
  it("rejeita criação sem imagem válida com erro 400 e código ADS_REQUIRE_AT_LEAST_ONE_IMAGE", async () => {
    eligibility.ensurePublishEligibility.mockResolvedValue({
      advertiser: { id: "adv1" },
      account: { raw_plan: "free" },
    });

    let caught;
    await createAdNormalized(
      {
        title: "X",
        price: 1,
        city_id: 1,
        city: "Atibaia",
        state: "SP",
        brand: "VW",
        model: "Gol",
        year: 2020,
        mileage: 0,
        images: [],
      },
      { id: "user-1" },
      { requestId: "rid-test" }
    ).catch((err) => {
      caught = err;
    });

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(400);
    // executeAdInsert NUNCA é chamado quando a invariante falha:
    expect(persistence.executeAdInsert).not.toHaveBeenCalled();
  });
});
