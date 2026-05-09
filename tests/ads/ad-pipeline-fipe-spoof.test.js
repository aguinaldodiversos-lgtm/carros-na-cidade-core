import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * E2E pipeline × Backend FIPE Service — anti-spoof.
 *
 * Cobre o caso central: cliente envia `fipe_value` arbitrário tentando
 * influenciar a decisão de antifraude. Após esta rodada, o pipeline
 * consulta o FIPE server-side e ignora o valor do cliente como fonte
 * autoritativa. Os cenários cobrem:
 *
 *   1. Cliente envia fipe_value alto + price baixo, sem códigos →
 *      backend retorna unavailable → pipeline NÃO usa o hint → status
 *      ACTIVE (regra "FIPE_UNAVAILABLE não bloqueia"), mas evento
 *      auditável gravado.
 *   2. Cliente envia fipe_value FALSO alto + códigos válidos →
 *      backend cota e descobre preço REAL bem maior que `price` →
 *      diff = -30% → status PENDING_REVIEW. Spoof falha.
 *   3. Cliente envia fipe_value falso (baixo) tentando forjar review →
 *      sem códigos → backend não usa hint → ACTIVE. Spoof falha de
 *      novo (cliente não consegue forjar review).
 *   4. Códigos válidos + provider falha + cliente sem hint →
 *      FIPE_UNAVAILABLE (não bloqueia, registra sinal informativo).
 *   5. Códigos válidos, preço REAL compatível → ACTIVE com snapshot.
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

// Mock do provider FIPE (HTTP) — controlamos o snapshot por teste.
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

const baseAdvertiser = { id: "adv-1" };
const baseAccount = {
  id: "user-1",
  raw_plan: "free",
  created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
};

function payload(overrides = {}) {
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
    ...overrides,
  };
}

beforeEach(() => {
  eligibility.ensurePublishEligibility.mockReset().mockResolvedValue({
    advertiser: baseAdvertiser,
    account: baseAccount,
  });
  persistence.executeAdInsert.mockReset().mockImplementation(async (row) => ({
    id: 7777,
    status: row.status,
    title: row.title,
  }));
  riskRepo.persistAdRiskSnapshot.mockReset();
  riskRepo.persistAdRiskSignals.mockReset();
  riskRepo.recordModerationEvent.mockReset();
  provider.quoteByCodes.mockReset();
});

describe("E2E anti-spoof — fipe_value do cliente NÃO altera decisão", () => {
  it("1. cliente envia fipe_value alto sem códigos → ACTIVE, snapshot=client_hint", async () => {
    // Sem códigos canônicos, o provider nunca é chamado.
    const result = await createAdNormalized(
      payload({ price: 80_000, fipe_value: 200_000 }),
      { id: "user-1" }
    );
    expect(result.status).toBe("active");
    // Risk reasons NÃO incluem PRICE_BELOW_FIPE_* — o hint do cliente foi descartado.
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).toContain("FIPE_UNAVAILABLE");
    expect(codes).not.toContain("PRICE_BELOW_FIPE_REVIEW");
    expect(provider.quoteByCodes).not.toHaveBeenCalled();

    // Auditoria: evento fipe_resolved com used_client_hint=true.
    const fipeEvent = riskRepo.recordModerationEvent.mock.calls
      .map(([e]) => e)
      .find((e) => e.eventType === "fipe_resolved");
    expect(fipeEvent).toBeTruthy();
    expect(fipeEvent.metadata.used_client_hint).toBe(true);
    expect(fipeEvent.metadata.confidence).toBe("low");
    expect(fipeEvent.metadata.client_hint_value).toBe(200_000);
  });

  it("2. cliente envia fipe_value FALSO + códigos → backend usa snapshot real → PENDING_REVIEW", async () => {
    // Cliente diz `fipe_value: 80_000` (igual ao preço, fingindo "ok"),
    // mas o provider real retorna 120_000 → diff = -33% → REVIEW.
    provider.quoteByCodes.mockResolvedValue({
      ok: true,
      price: 120_000,
      fipeCode: "001234-5",
      referenceMonth: "maio de 2026",
    });

    const result = await createAdNormalized(
      payload({
        price: 80_000,
        fipe_value: 80_000, // tentativa de spoof
        fipe_brand_code: "23",
        fipe_model_code: "5585",
        fipe_year_code: "2018-1",
      }),
      { id: "user-1" }
    );

    expect(result.status).toBe("pending_review");
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).toContain("PRICE_BELOW_FIPE_REVIEW");
    expect(codes).not.toContain("FIPE_UNAVAILABLE");
    // O valor persistido é o do servidor, não o do cliente.
    expect(result.risk_reasons.find((r) => r.code === "PRICE_BELOW_FIPE_REVIEW")
      .metadata.fipeValue).toBe(120_000);
    // Provider foi consultado.
    expect(provider.quoteByCodes).toHaveBeenCalledTimes(1);
    expect(provider.quoteByCodes).toHaveBeenCalledWith(
      expect.objectContaining({
        brandCode: "23",
        modelCode: "5585",
        yearCode: "2018-1",
      })
    );
  });

  it("3. cliente envia fipe_value baixo tentando forjar review (sem códigos) → ACTIVE", async () => {
    const result = await createAdNormalized(
      payload({ price: 80_000, fipe_value: 10_000 /* valor absurdo p/ forjar -87% */ }),
      { id: "user-1" }
    );
    expect(result.status).toBe("active");
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).not.toContain("PRICE_FAR_BELOW_FIPE_CRITICAL");
    expect(codes).not.toContain("PRICE_BELOW_FIPE_REVIEW");
  });

  it("4. códigos válidos + provider falha → FIPE_UNAVAILABLE, ACTIVE", async () => {
    provider.quoteByCodes.mockResolvedValue({ ok: false, reason: "network_error" });

    const result = await createAdNormalized(
      payload({
        price: 80_000,
        fipe_brand_code: "23",
        fipe_model_code: "5585",
        fipe_year_code: "2018-1",
      }),
      { id: "user-1" }
    );

    expect(result.status).toBe("active");
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).toContain("FIPE_UNAVAILABLE");
  });

  it("5. códigos válidos, preço compatível → ACTIVE com snapshot HIGH confidence", async () => {
    provider.quoteByCodes.mockResolvedValue({
      ok: true,
      price: 85_000,
      fipeCode: "001234-5",
    });

    const result = await createAdNormalized(
      payload({
        price: 80_000,
        fipe_brand_code: "23",
        fipe_model_code: "5585",
        fipe_year_code: "2018-1",
      }),
      { id: "user-1" }
    );

    expect(result.status).toBe("active");
    expect(result.risk_level).toBe("low");
    const fipeEvent = riskRepo.recordModerationEvent.mock.calls
      .map(([e]) => e)
      .find((e) => e.eventType === "fipe_resolved");
    expect(fipeEvent.metadata.confidence).toBe("high");
    expect(fipeEvent.metadata.source).toBe("parallelum");
    expect(fipeEvent.metadata.used_client_hint).toBe(false);
  });
});
