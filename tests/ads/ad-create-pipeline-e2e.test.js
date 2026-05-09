import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tarefa 6 — E2E do pipeline de criação (A-D).
 *
 * Cobre o fluxo completo `createAdNormalized`:
 *   • Validate (Zod) → eligibility → calculateForAd → INSERT.
 *
 * Não toca banco: mockamos `ensurePublishEligibility`, `executeAdInsert`
 * e o repository de risk para isolar o orchestrador. O service de risco
 * (calculateForAd) roda de verdade — ele é puro e já tem testes próprios
 * em ad-risk-service.test.js.
 *
 * Cenários:
 *   A. Anúncio normal — preço compatível → status final ACTIVE.
 *   B. Preço 30% abaixo da FIPE → status final PENDING_REVIEW.
 *   C. Preço 45% abaixo da FIPE → PENDING_REVIEW + risk_level CRITICAL.
 *   D. FIPE indisponível (null) → não bloqueia; sinal FIPE_UNAVAILABLE
 *      registrado, status final segue regra normal de score.
 *
 * O cenário E (boost requires ACTIVE) é coberto por
 *   tests/payments/boost-requires-active-status.test.js.
 */

vi.mock("../../src/modules/ads/ads.publish.eligibility.service.js", () => ({
  ensurePublishEligibility: vi.fn(),
}));

vi.mock("../../src/modules/ads/ads.persistence.service.js", () => ({
  prepareAdInsertPayload: vi.fn((p) => p),
  executeAdInsert: vi.fn(),
}));

vi.mock("../../src/modules/ads/risk/ad-risk.repository.js", () => ({
  persistAdRiskSnapshot: vi.fn(async () => {}),
  persistAdRiskSignals: vi.fn(async () => {}),
  recordModerationEvent: vi.fn(async () => {}),
  countDistinctOwnersForPhone: vi.fn(async () => 0),
}));

// Mock do provider FIPE — fonte de verdade no novo contrato.
// Cenários B/C/D abaixo configuram retorno por teste.
vi.mock("../../src/modules/fipe/fipe.provider.js", () => ({
  quoteByCodes: vi.fn(),
  parseFipePriceBr: vi.fn(),
  __resetFipeProviderCache: vi.fn(),
  __fipeProviderCacheSize: vi.fn(),
}));

const eligibility = await import(
  "../../src/modules/ads/ads.publish.eligibility.service.js"
);
const persistence = await import(
  "../../src/modules/ads/ads.persistence.service.js"
);
const riskRepo = await import(
  "../../src/modules/ads/risk/ad-risk.repository.js"
);
const provider = await import("../../src/modules/fipe/fipe.provider.js");
const { createAdNormalized } = await import(
  "../../src/modules/ads/ads.create.pipeline.service.js"
);

/** Códigos FIPE canônicos válidos para o pipeline cotar via provider. */
const FIPE_CODES = {
  fipe_brand_code: "23",
  fipe_model_code: "5585",
  fipe_year_code: "2018-1",
};

const baseAdvertiser = { id: "adv-1" };
const baseAccount = {
  id: "user-1",
  raw_plan: "free",
  // conta antiga: não dispara NEW_ACCOUNT
  created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
};

function basePayload(overrides = {}) {
  return {
    title: "Honda Civic 2018 LX",
    description: "Veículo conservado, segundo dono.",
    price: 80_000,
    city_id: 1,
    city: "Atibaia",
    state: "SP",
    brand: "Honda",
    model: "Civic",
    year: 2018,
    mileage: 50_000,
    images: [
      "https://r2.example/qa/1.webp",
      "https://r2.example/qa/2.webp",
      "https://r2.example/qa/3.webp",
    ],
    // Códigos canônicos para o backend cotar a FIPE via provider.
    // Com isso o pipeline ignora `fipe_value` e usa o snapshot real.
    ...FIPE_CODES,
    fipe_value: 85_000, // hint do cliente (descartado pelo backend)
    ...overrides,
  };
}

beforeEach(() => {
  eligibility.ensurePublishEligibility.mockReset().mockResolvedValue({
    advertiser: baseAdvertiser,
    account: baseAccount,
  });
  persistence.executeAdInsert.mockReset().mockImplementation(async (row) => ({
    id: 4242,
    status: row.status,
    title: row.title,
  }));
  riskRepo.persistAdRiskSnapshot.mockReset();
  riskRepo.persistAdRiskSignals.mockReset();
  riskRepo.recordModerationEvent.mockReset();
  provider.quoteByCodes.mockReset();
});

describe("E2E — pipeline de criação", () => {
  it("A. preço compatível → status final ACTIVE (FIPE server-side high)", async () => {
    provider.quoteByCodes.mockResolvedValue({ ok: true, price: 85_000 });
    const result = await createAdNormalized(basePayload(), { id: "user-1" });
    expect(result.status).toBe("active");
    expect(result.moderation_status).toBe("approved");
    const insertedRow = persistence.executeAdInsert.mock.calls[0][0];
    expect(insertedRow.status).toBe("active");
    expect(riskRepo.persistAdRiskSnapshot).toHaveBeenCalledTimes(1);
    expect(result.risk_level).toBe("low");
  });

  it("B. FIPE server-side detecta -30% → PENDING_REVIEW (cliente envia fipe_value falso)", async () => {
    // Provider real retorna 100_000; cliente tenta enviar 70_000 (igual ao preço)
    // como tentativa de spoof. Backend ignora o hint e usa 100_000.
    provider.quoteByCodes.mockResolvedValue({ ok: true, price: 100_000 });
    const result = await createAdNormalized(
      basePayload({ price: 70_000, fipe_value: 70_000 }),
      { id: "user-1" }
    );
    expect(result.status).toBe("pending_review");
    expect(result.moderation_status).toBe("pending_review");
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).toContain("PRICE_BELOW_FIPE_REVIEW");
    const eventTypes = riskRepo.recordModerationEvent.mock.calls.map(
      ([e]) => e.eventType
    );
    expect(eventTypes).toContain("sent_to_review");
  });

  it("C. FIPE server-side detecta -45% → PENDING_REVIEW critical", async () => {
    provider.quoteByCodes.mockResolvedValue({ ok: true, price: 100_000 });
    const result = await createAdNormalized(
      basePayload({ price: 55_000, fipe_value: 55_000 }),
      { id: "user-1" }
    );
    expect(result.status).toBe("pending_review");
    expect(result.risk_level).toBe("critical");
    const critical = result.risk_reasons.find(
      (r) => r.code === "PRICE_FAR_BELOW_FIPE_CRITICAL"
    );
    expect(critical?.severity).toBe("critical");
  });

  it("D. FIPE indisponível (provider retorna ok=false) → ACTIVE + FIPE_UNAVAILABLE", async () => {
    provider.quoteByCodes.mockResolvedValue({ ok: false, reason: "network_error" });
    const result = await createAdNormalized(
      basePayload({ fipe_value: null }),
      { id: "user-1" }
    );
    expect(result.status).toBe("active");
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).toContain("FIPE_UNAVAILABLE");
  });

  it("preço inválido (zero) → AppError 400 sem INSERT", async () => {
    let err;
    await createAdNormalized(basePayload({ price: 0 }), { id: "user-1" }).catch(
      (e) => (err = e)
    );
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    // Nenhum INSERT, nenhum snapshot — anúncio nunca existiu.
    expect(persistence.executeAdInsert).not.toHaveBeenCalled();
    expect(riskRepo.persistAdRiskSnapshot).not.toHaveBeenCalled();
  });
});

describe("E2E — filtros públicos só ACTIVE (Tarefa 7 saneamento)", () => {
  it("o WHERE fixado em ads-filter.builder cobre /comprar e variantes (status=active)", async () => {
    const { buildAdsSearchQuery } = await import(
      "../../src/modules/ads/filters/ads-filter.builder.js"
    );
    const cases = [
      { city_slug: "atibaia-sp" },
      { city_slugs: ["atibaia-sp", "santos-sp"] },
      { brand: "Honda", state: "SP" },
      { below_fipe: true },
    ];
    for (const filters of cases) {
      const { dataQuery, countQuery } = buildAdsSearchQuery(filters);
      expect(String(dataQuery)).toMatch(/a\.status\s*=\s*'active'/);
      expect(String(countQuery)).toMatch(/a\.status\s*=\s*'active'/);
      // Nenhum SQL público filtra explicitamente por outros status.
      for (const blocked of ["pending_review", "rejected", "sold", "expired"]) {
        expect(String(dataQuery)).not.toMatch(
          new RegExp(`a\\.status\\s*=\\s*'${blocked}'`)
        );
      }
    }
  });
});
