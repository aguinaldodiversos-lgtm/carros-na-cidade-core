import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_DISCOUNT_RATIO,
  opportunityExpr,
} from "../../src/modules/ads/filters/ads-ranking.sql.js";
import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";

function normalize(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

describe("opportunityExpr — estrutura da regra de produto (>=10% abaixo da FIPE)", () => {
  const sql = normalize(opportunityExpr);

  it("exporta string SQL bem-formada (parênteses balanceados)", () => {
    expect(typeof opportunityExpr).toBe("string");
    expect(sql.startsWith("(")).toBe(true);
    expect(sql.endsWith(")")).toBe(true);
  });

  it("OPPORTUNITY_DISCOUNT_RATIO = 0.9 (margem mínima de 10%)", () => {
    expect(OPPORTUNITY_DISCOUNT_RATIO).toBe(0.9);
  });

  it("exige below_fipe = true (mesmo que cálculo derive da margem, guarda explícita)", () => {
    expect(sql).toContain("a.below_fipe = true");
  });

  it("exige fipe_reference_value não-nulo e > 0 (defesa contra dado malformado)", () => {
    expect(sql).toContain("a.fipe_reference_value IS NOT NULL");
    expect(sql).toContain("a.fipe_reference_value > 0");
  });

  it("exige price não-nulo e > 0 (defesa contra dado malformado)", () => {
    expect(sql).toContain("a.price IS NOT NULL");
    expect(sql).toContain("a.price > 0");
  });

  it("aplica comparação price <= fipe_reference_value * 0.9 (limiar canônico)", () => {
    expect(sql).toContain("a.price <= a.fipe_reference_value * 0.9");
  });

  it("expressão completa usa AND entre todas as condições (regra estrita)", () => {
    // Conta a sequência "AND" (case-insensitive). Esperamos 5 ANDs unindo 6 condições.
    const andCount = (sql.match(/\bAND\b/gi) || []).length;
    expect(andCount).toBe(5);
  });
});

describe("buildAdsSearchQuery — opportunity exposto no SELECT", () => {
  it("dataQuery inclui AS opportunity", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    expect(normalize(dataQuery)).toContain("AS opportunity");
  });

  it("opportunity vem do opportunityExpr (não é apenas alias de below_fipe)", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    const aliasIdx = sql.indexOf("AS opportunity");
    expect(aliasIdx).toBeGreaterThan(-1);
    // Garante que a regra completa precede o alias (não é só "a.below_fipe AS opportunity").
    const exprStart = sql.lastIndexOf("(", aliasIdx);
    expect(exprStart).toBeGreaterThan(-1);
    const exprBody = sql.slice(exprStart, aliasIdx);
    expect(exprBody).toContain("a.price <= a.fipe_reference_value * 0.9");
  });

  it("opportunity presente independente do sort escolhido", () => {
    for (const sort of ["recent", "price_asc", "price_desc", "highlight", "relevance"]) {
      const { dataQuery } = buildAdsSearchQuery({ sort });
      expect(normalize(dataQuery)).toContain("AS opportunity");
    }
  });

  it("countQuery NÃO expõe opportunity (só listagem precisa)", () => {
    const { countQuery } = buildAdsSearchQuery({});
    expect(normalize(countQuery)).not.toContain("opportunity");
  });
});
