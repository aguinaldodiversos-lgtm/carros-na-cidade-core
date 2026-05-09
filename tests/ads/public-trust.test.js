import { describe, expect, it } from "vitest";

import {
  applyPublicTrustFields,
  deriveSellerKind,
  hadBelowFipeRiskSignal,
  isReviewedAfterBelowFipe,
} from "../../src/modules/ads/ads.public-trust.js";

/**
 * Cobertura do trust mapper canônico do backend público.
 *
 * Garantias:
 *   1. `risk_reasons` cru NUNCA vai para a API pública (vazaria heurística
 *      do antifraude).
 *   2. `reviewed_by` NUNCA vai para a API pública (privacidade interna).
 *   3. Selo "anúncio analisado" SÓ aparece quando o anúncio teve sinal
 *      de preço abaixo da FIPE E foi revisado E está active.
 *   4. Tipo de anunciante: dealership_id válido > account_type CNPJ >
 *      private. Sem heurística por nome.
 */

describe("hadBelowFipeRiskSignal", () => {
  it("retorna true para PRICE_BELOW_FIPE_REVIEW (medium)", () => {
    expect(
      hadBelowFipeRiskSignal({
        risk_reasons: [{ code: "PRICE_BELOW_FIPE_REVIEW", severity: "medium" }],
      })
    ).toBe(true);
  });

  it("retorna true para PRICE_FAR_BELOW_FIPE_CRITICAL", () => {
    expect(
      hadBelowFipeRiskSignal({
        risk_reasons: [{ code: "PRICE_FAR_BELOW_FIPE_CRITICAL" }],
      })
    ).toBe(true);
  });

  it("aceita risk_reasons vindo como string JSON (postgres jsonb)", () => {
    expect(
      hadBelowFipeRiskSignal({
        risk_reasons: JSON.stringify([{ code: "PRICE_BELOW_FIPE_REVIEW" }]),
      })
    ).toBe(true);
  });

  it("aceita campo legado signal_code", () => {
    expect(
      hadBelowFipeRiskSignal({
        risk_reasons: [{ signal_code: "PRICE_BELOW_FIPE_REVIEW" }],
      })
    ).toBe(true);
  });

  it("retorna false para outros sinais (ex.: PHONE_IN_DESCRIPTION)", () => {
    expect(
      hadBelowFipeRiskSignal({
        risk_reasons: [{ code: "PHONE_IN_DESCRIPTION", severity: "high" }],
      })
    ).toBe(false);
  });

  it("retorna false quando risk_reasons é null/undefined/lista vazia", () => {
    expect(hadBelowFipeRiskSignal({})).toBe(false);
    expect(hadBelowFipeRiskSignal({ risk_reasons: null })).toBe(false);
    expect(hadBelowFipeRiskSignal({ risk_reasons: [] })).toBe(false);
  });
});

describe("isReviewedAfterBelowFipe — selo 'Anúncio analisado'", () => {
  const baseRow = {
    status: "active",
    reviewed_at: "2026-04-30T12:00:00Z",
    risk_reasons: [{ code: "PRICE_BELOW_FIPE_REVIEW" }],
  };

  it("active + below_fipe signal + reviewed_at → true", () => {
    expect(isReviewedAfterBelowFipe(baseRow)).toBe(true);
  });

  it("status pending_review NÃO recebe selo (anúncio nem é público ainda)", () => {
    expect(isReviewedAfterBelowFipe({ ...baseRow, status: "pending_review" })).toBe(
      false
    );
  });

  it("status rejected NÃO recebe selo", () => {
    expect(isReviewedAfterBelowFipe({ ...baseRow, status: "rejected" })).toBe(false);
  });

  it("active SEM reviewed_at NÃO recebe selo (não passou por moderação)", () => {
    expect(isReviewedAfterBelowFipe({ ...baseRow, reviewed_at: null })).toBe(false);
  });

  it("active SEM sinal de below_fipe NÃO recebe selo (anúncio comum)", () => {
    expect(
      isReviewedAfterBelowFipe({
        ...baseRow,
        risk_reasons: [{ code: "LOW_IMAGE_COUNT" }],
      })
    ).toBe(false);
  });
});

describe("deriveSellerKind", () => {
  it("dealership_id válido → dealer", () => {
    expect(deriveSellerKind({ dealership_id: 42 })).toBe("dealer");
  });

  it("account_type CNPJ sem dealership_id → dealer", () => {
    expect(deriveSellerKind({ account_type: "CNPJ" })).toBe("dealer");
  });

  it("account_type CPF sem dealership_id → private", () => {
    expect(deriveSellerKind({ account_type: "CPF" })).toBe("private");
  });

  it("nada além de dealership_name → private (não usar heurística por nome)", () => {
    expect(deriveSellerKind({ dealership_name: "AutoCar" })).toBe("private");
  });

  it("dealership_id zero/string vazia NÃO conta", () => {
    expect(deriveSellerKind({ dealership_id: 0 })).toBe("private");
    expect(deriveSellerKind({ dealership_id: "" })).toBe("private");
  });
});

describe("applyPublicTrustFields — sanitização", () => {
  const internal = {
    id: 1,
    status: "active",
    title: "Honda Civic 2020",
    risk_score: 75,
    risk_level: "high",
    risk_reasons: [{ code: "PRICE_BELOW_FIPE_REVIEW" }],
    reviewed_at: "2026-04-30T12:00:00Z",
    reviewed_by: "admin-123",
    rejection_reason: "interno",
    correction_requested_reason: "interno",
    structural_change_count: 4,
    dealership_id: 42,
  };

  it("remove campos internos sensíveis (risk_*, reviewed_by, rejection_reason)", () => {
    const out = applyPublicTrustFields(internal);
    expect(out).not.toHaveProperty("risk_score");
    expect(out).not.toHaveProperty("risk_level");
    expect(out).not.toHaveProperty("risk_reasons");
    expect(out).not.toHaveProperty("reviewed_by");
    expect(out).not.toHaveProperty("rejection_reason");
    expect(out).not.toHaveProperty("correction_requested_reason");
    expect(out).not.toHaveProperty("structural_change_count");
  });

  it("preserva reviewed_at (público) e dealership_id (público)", () => {
    const out = applyPublicTrustFields(internal);
    expect(out.reviewed_at).toBe(internal.reviewed_at);
    expect(out.dealership_id).toBe(42);
  });

  it("computa seller_kind + reviewed_after_below_fipe", () => {
    const out = applyPublicTrustFields(internal);
    expect(out.seller_kind).toBe("dealer");
    expect(out.seller_type).toBe("dealer");
    expect(out.reviewed_after_below_fipe).toBe(true);
  });

  it("retorna falsy reviewed_after_below_fipe quando o sinal não é below_fipe", () => {
    const out = applyPublicTrustFields({
      ...internal,
      risk_reasons: [{ code: "PHONE_IN_DESCRIPTION" }],
    });
    expect(out.reviewed_after_below_fipe).toBe(false);
  });
});
