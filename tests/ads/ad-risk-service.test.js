import { describe, it, expect } from "vitest";
import { calculateForAd } from "../../src/modules/ads/risk/ad-risk.service.js";

/**
 * Cenários cobertos (Tarefa 12 da rodada antifraude):
 *   1. preço 30% abaixo da FIPE → PENDING_REVIEW
 *   2. preço 45% abaixo da FIPE → PENDING_REVIEW + severidade crítica
 *   3. FIPE indisponível NÃO quebra criação
 *   4. score alto → PENDING_REVIEW
 *   5. baixo risco → ACTIVE
 *   13. STRUCTURAL_FIELD_CHANGE em contexto força review
 */

const baseAd = {
  title: "Honda Civic 2018",
  description: "Veículo em ótimo estado.",
  price: 80_000,
  brand: "Honda",
  model: "Civic",
  year: 2018,
  mileage: 50_000,
  images: ["https://r2/img-1.webp", "https://r2/img-2.webp", "https://r2/img-3.webp"],
};

const baseAccount = {
  id: "user-1",
  created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
};
const baseAdvertiser = { id: "adv-1", user_id: "user-1" };

describe("adRiskService.calculateForAd", () => {
  it("baixo risco → ACTIVE (não vai para review)", async () => {
    const r = await calculateForAd({
      ad: baseAd,
      account: baseAccount,
      advertiser: baseAdvertiser,
      fipeValue: 85_000,
    });
    expect(r.shouldRejectImmediately).toBe(false);
    expect(r.shouldSendToReview).toBe(false);
    expect(r.riskLevel).toBe("low");
  });

  it("preço 30% abaixo da FIPE → PENDING_REVIEW (high)", async () => {
    const r = await calculateForAd({
      ad: { ...baseAd, price: 70_000 },
      account: baseAccount,
      advertiser: baseAdvertiser,
      fipeValue: 100_000, // diff = -30%
    });
    expect(r.shouldSendToReview).toBe(true);
    expect(r.shouldRejectImmediately).toBe(false);
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain("PRICE_BELOW_FIPE_REVIEW");
    // risk_level >= high
    expect(["high", "critical"]).toContain(r.riskLevel);
  });

  it("preço 45% abaixo da FIPE → PENDING_REVIEW com severidade crítica", async () => {
    const r = await calculateForAd({
      ad: { ...baseAd, price: 55_000 },
      account: baseAccount,
      advertiser: baseAdvertiser,
      fipeValue: 100_000, // diff = -45%
    });
    expect(r.shouldSendToReview).toBe(true);
    const critical = r.reasons.find(
      (x) => x.code === "PRICE_FAR_BELOW_FIPE_CRITICAL"
    );
    expect(critical).toBeTruthy();
    expect(critical.severity).toBe("critical");
    expect(r.riskLevel).toBe("critical");
  });

  it("FIPE indisponível NÃO quebra a criação (sinal informativo apenas)", async () => {
    const r = await calculateForAd({
      ad: baseAd,
      account: baseAccount,
      advertiser: baseAdvertiser,
      fipeValue: null,
    });
    expect(r.shouldRejectImmediately).toBe(false);
    expect(r.fipeReferenceValue).toBeNull();
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain("FIPE_UNAVAILABLE");
  });

  it("preço inválido (zero) → REJECTED imediato", async () => {
    const r = await calculateForAd({
      ad: { ...baseAd, price: 0 },
      account: baseAccount,
      advertiser: baseAdvertiser,
      fipeValue: 80_000,
    });
    expect(r.shouldRejectImmediately).toBe(true);
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain("PRICE_INVALID");
  });

  it("preço R$ 1 → REJECTED imediato (sentinela)", async () => {
    const r = await calculateForAd({
      ad: { ...baseAd, price: 1 },
      account: baseAccount,
      advertiser: baseAdvertiser,
      fipeValue: 80_000,
    });
    expect(r.shouldRejectImmediately).toBe(true);
  });

  it("score alto via múltiplos sinais médios → PENDING_REVIEW", async () => {
    const r = await calculateForAd({
      ad: {
        ...baseAd,
        description:
          "Vendo carro. Liga (11) 99999-9999 e veja em https://exemplo.com",
        images: ["https://r2/img-1.webp"], // poucas fotos
      },
      account: {
        ...baseAccount,
        created_at: new Date().toISOString(), // conta nova
      },
      advertiser: baseAdvertiser,
      fipeValue: 85_000,
    });
    // PHONE_IN_DESCRIPTION + EXTERNAL_LINK + LOW_IMAGE + NEW_ACCOUNT
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    expect(r.shouldSendToReview).toBe(true);
  });

  it("STRUCTURAL_FIELD_CHANGE no contexto força review", async () => {
    const r = await calculateForAd({
      ad: baseAd,
      account: baseAccount,
      advertiser: baseAdvertiser,
      fipeValue: 85_000,
      context: { structuralFieldChanges: { brand: "Toyota" } },
    });
    expect(r.shouldSendToReview).toBe(true);
    expect(r.reasons.some((x) => x.code === "STRUCTURAL_FIELD_CHANGE")).toBe(
      true
    );
  });

  it("PHONE_REUSED_ACROSS_ACCOUNTS é emitido quando dependency reporta >= 2 donos", async () => {
    const r = await calculateForAd(
      {
        ad: baseAd,
        account: { ...baseAccount, whatsapp: "11987654321" },
        advertiser: baseAdvertiser,
        fipeValue: 85_000,
      },
      { countDistinctOwnersForPhone: async () => 3 }
    );
    expect(r.reasons.some((x) => x.code === "PHONE_REUSED_ACROSS_ACCOUNTS")).toBe(
      true
    );
  });

  it("falha do dependency PHONE_REUSED não derruba o cálculo", async () => {
    const r = await calculateForAd(
      {
        ad: baseAd,
        account: { ...baseAccount, whatsapp: "11987654321" },
        advertiser: baseAdvertiser,
        fipeValue: 85_000,
      },
      { countDistinctOwnersForPhone: async () => { throw new Error("db down"); } }
    );
    // Não deve incluir o sinal, mas tampouco derrubar.
    expect(r.reasons.some((x) => x.code === "PHONE_REUSED_ACROSS_ACCOUNTS")).toBe(
      false
    );
  });
});
