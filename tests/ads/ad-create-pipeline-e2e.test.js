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

const eligibility = await import(
  "../../src/modules/ads/ads.publish.eligibility.service.js"
);
const persistence = await import(
  "../../src/modules/ads/ads.persistence.service.js"
);
const riskRepo = await import(
  "../../src/modules/ads/risk/ad-risk.repository.js"
);
const { createAdNormalized } = await import(
  "../../src/modules/ads/ads.create.pipeline.service.js"
);

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
    fipe_value: 85_000,
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
});

describe("E2E — pipeline de criação", () => {
  it("A. preço compatível → status final ACTIVE", async () => {
    const result = await createAdNormalized(basePayload(), { id: "user-1" });
    expect(result.status).toBe("active");
    expect(result.moderation_status).toBe("approved");
    // INSERT chamado com status='active'.
    const insertedRow = persistence.executeAdInsert.mock.calls[0][0];
    expect(insertedRow.status).toBe("active");
    // Snapshot persistido com risk_level baixo.
    expect(riskRepo.persistAdRiskSnapshot).toHaveBeenCalledTimes(1);
    expect(result.risk_level).toBe("low");
  });

  it("B. preço 30% abaixo da FIPE → PENDING_REVIEW", async () => {
    const result = await createAdNormalized(
      basePayload({ price: 70_000, fipe_value: 100_000 }),
      { id: "user-1" }
    );
    expect(result.status).toBe("pending_review");
    expect(result.moderation_status).toBe("pending_review");
    const insertedRow = persistence.executeAdInsert.mock.calls[0][0];
    expect(insertedRow.status).toBe("pending_review");
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).toContain("PRICE_BELOW_FIPE_REVIEW");

    // Evento sent_to_review registrado.
    const eventTypes = riskRepo.recordModerationEvent.mock.calls.map(
      ([e]) => e.eventType
    );
    expect(eventTypes).toContain("sent_to_review");
  });

  it("C. preço 45% abaixo da FIPE → PENDING_REVIEW + risk_level CRITICAL", async () => {
    const result = await createAdNormalized(
      basePayload({ price: 55_000, fipe_value: 100_000 }),
      { id: "user-1" }
    );
    expect(result.status).toBe("pending_review");
    expect(result.risk_level).toBe("critical");
    const codes = result.risk_reasons.map((r) => r.code);
    expect(codes).toContain("PRICE_FAR_BELOW_FIPE_CRITICAL");
    const critical = result.risk_reasons.find(
      (r) => r.code === "PRICE_FAR_BELOW_FIPE_CRITICAL"
    );
    expect(critical.severity).toBe("critical");
  });

  it("D. FIPE indisponível (null) NÃO quebra a criação; sinal FIPE_UNAVAILABLE", async () => {
    const result = await createAdNormalized(
      basePayload({ fipe_value: null }),
      { id: "user-1" }
    );
    expect(result.status).toBe("active"); // só FIPE_UNAVAILABLE não força review
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
