import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testes do endpoint público `GET /api/public/commercial/boost`.
 *
 * Garante que o card público de /planos consome a MESMA fonte do checkout
 * (platform_settings via getCommercialRules) e que nada sensível vaza.
 */

const mocks = {
  getCommercialRules: vi.fn(),
};
vi.mock("../../src/modules/commercial/commercial-rules.service.js", () => ({
  getCommercialRules: (...args) => mocks.getCommercialRules(...args),
}));

const { getPublicBoostConfig } = await import(
  "../../src/modules/public/public-commercial.controller.js"
);

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  mocks.getCommercialRules.mockReset();
});

describe("GET /api/public/commercial/boost", () => {
  it("retorna boost-7d com price_cents e duration_days de platform_settings", async () => {
    mocks.getCommercialRules.mockResolvedValue({
      boost_default_price_cents: 3990,
      boost_default_days: 7,
      allow_boost_cpf: true,
      allow_boost_cnpj: true,
    });

    const res = makeRes();
    await getPublicBoostConfig({}, res, (e) => {
      throw e;
    });

    expect(res.body.boost).toMatchObject({
      id: "boost-7d",
      name: "Destaque 7 dias",
      price_cents: 3990,
      duration_days: 7,
      active: true,
    });
  });

  it("reflete edição admin (preço/dias diferentes)", async () => {
    mocks.getCommercialRules.mockResolvedValue({
      boost_default_price_cents: 4990,
      boost_default_days: 14,
      allow_boost_cpf: true,
      allow_boost_cnpj: false,
    });

    const res = makeRes();
    await getPublicBoostConfig({}, res, (e) => {
      throw e;
    });

    expect(res.body.boost.price_cents).toBe(4990);
    expect(res.body.boost.duration_days).toBe(14);
    expect(res.body.boost.name).toBe("Destaque 14 dias");
    expect(res.body.boost.active).toBe(true); // CPF habilitado basta
  });

  it("active=false quando CPF e CNPJ estão ambos desabilitados", async () => {
    mocks.getCommercialRules.mockResolvedValue({
      boost_default_price_cents: 3990,
      boost_default_days: 7,
      allow_boost_cpf: false,
      allow_boost_cnpj: false,
    });

    const res = makeRes();
    await getPublicBoostConfig({}, res, (e) => {
      throw e;
    });

    expect(res.body.boost.active).toBe(false);
  });

  it("NÃO expõe campos sensíveis (tokens, trava do Pro, duplicate behavior)", async () => {
    mocks.getCommercialRules.mockResolvedValue({
      boost_default_price_cents: 3990,
      boost_default_days: 7,
      boost_duplicate_behavior: "extend_duration",
      boost_max_extension_days: 90,
      pro_ad_limit_guard: 1000,
      allow_boost_cpf: true,
      allow_boost_cnpj: true,
    });

    const res = makeRes();
    await getPublicBoostConfig({}, res, (e) => {
      throw e;
    });

    const keys = Object.keys(res.body.boost);
    expect(keys.sort()).toEqual(
      ["active", "description", "duration_days", "id", "name", "price_cents"].sort()
    );
    // Defesa explícita contra vazamento de chaves internas.
    expect(res.body.boost).not.toHaveProperty("pro_ad_limit_guard");
    expect(res.body.boost).not.toHaveProperty("boost_duplicate_behavior");
    expect(res.body.boost).not.toHaveProperty("boost_max_extension_days");
  });
});
