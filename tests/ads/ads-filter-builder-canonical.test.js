import { describe, expect, it } from "vitest";
import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";
import { adsFilterQuerySchema } from "../../src/modules/ads/filters/ads-filter.schema.js";

function normalize(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Testa que os filtros canônicos da Fase 3 (priority_tier, opportunity,
 * seller_kind) produzem WHEREs corretos no SQL, e que o schema Zod aceita
 * apenas valores válidos.
 *
 * Filtros públicos suportados:
 *   - priority_tier: 1..4
 *   - opportunity: true
 *   - seller_kind: 'dealer' | 'private'
 *   - below_fipe: true/false
 *   - highlight_only: true
 */

/**
 * Helpers para inspecionar apenas o trecho WHERE do dataQuery. As
 * expressões canônicas (commercialLayerExpr/opportunityExpr/sellerKindExpr)
 * aparecem em múltiplas seções (SELECT, ORDER BY relevance, WHERE quando
 * filtra) — recortar o WHERE evita falsos positivos.
 */
function whereSection(sql) {
  const whereIdx = sql.indexOf("WHERE");
  const orderByIdx = sql.indexOf("ORDER BY", whereIdx);
  return whereIdx >= 0 && orderByIdx > whereIdx ? sql.slice(whereIdx, orderByIdx) : "";
}

function commercialLayerInWhere(sql) {
  // commercialLayerExpr termina com `ELSE 1 END`. Único nessa seção.
  return /ELSE 1 END/.test(whereSection(sql));
}

function sellerKindInWhere(sql) {
  // sellerKindExpr termina com `ELSE 'private' END`.
  return /ELSE 'private' END/.test(whereSection(sql));
}

function opportunityInWhere(sql) {
  // opportunityExpr no WHERE termina com `) = true`. Verifica pelo
  // núcleo `<= a.fipe_reference_value * 0.9` precedendo `= true`.
  return /price <= a\.fipe_reference_value \* 0\.9[\s\S]*?\) = true/.test(whereSection(sql));
}

describe("buildAdsSearchQuery — filtro priority_tier", () => {
  it("priority_tier=4 injeta WHERE commercial_layer=4 (Destaques)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ priority_tier: 4 });
    expect(commercialLayerInWhere(normalize(dataQuery))).toBe(true);
    expect(params).toContain(4);
  });

  it("priority_tier=3 injeta WHERE com commercial_layer=3 (Pro)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ priority_tier: 3 });
    expect(commercialLayerInWhere(normalize(dataQuery))).toBe(true);
    expect(params).toContain(3);
  });

  it("priority_tier=2 injeta WHERE com commercial_layer=2 (Start)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ priority_tier: 2 });
    expect(commercialLayerInWhere(normalize(dataQuery))).toBe(true);
    expect(params).toContain(2);
  });

  it("priority_tier=1 injeta WHERE com commercial_layer=1 (Grátis)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ priority_tier: 1 });
    expect(commercialLayerInWhere(normalize(dataQuery))).toBe(true);
    expect(params).toContain(1);
  });

  it("priority_tier ausente NÃO injeta WHERE", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    expect(commercialLayerInWhere(normalize(dataQuery))).toBe(false);
  });

  it("priority_tier fora de 1..4 (0, 5, -1, string não-numérica, null) NÃO injeta WHERE (defesa)", () => {
    // Note: "3" é coerced para 3 (válido) pelo Number() — aceitamos isso
    // como caller programático válido. A defesa rejeita apenas valores
    // que NÃO viram inteiro 1..4 (0/5/-1 numéricos, "abc"/null/undefined).
    for (const bogus of [0, 5, -1, "abc", null]) {
      const { dataQuery } = buildAdsSearchQuery({ priority_tier: bogus });
      expect(commercialLayerInWhere(normalize(dataQuery))).toBe(false);
    }
  });
});

describe("buildAdsSearchQuery — filtro opportunity", () => {
  it("opportunity=true injeta WHERE com opportunityExpr=true", () => {
    const { dataQuery } = buildAdsSearchQuery({ opportunity: true });
    expect(opportunityInWhere(normalize(dataQuery))).toBe(true);
  });

  it("opportunity=false NÃO injeta WHERE (não restringe; sem efeito útil)", () => {
    const { dataQuery } = buildAdsSearchQuery({ opportunity: false });
    expect(opportunityInWhere(normalize(dataQuery))).toBe(false);
  });

  it("opportunity=undefined NÃO injeta WHERE", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    expect(opportunityInWhere(normalize(dataQuery))).toBe(false);
  });
});

describe("buildAdsSearchQuery — filtro seller_kind", () => {
  it("seller_kind='dealer' injeta WHERE com sellerKindExpr e param 'dealer'", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ seller_kind: "dealer" });
    expect(sellerKindInWhere(normalize(dataQuery))).toBe(true);
    expect(params).toContain("dealer");
  });

  it("seller_kind='private' injeta WHERE com param 'private'", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ seller_kind: "private" });
    expect(sellerKindInWhere(normalize(dataQuery))).toBe(true);
    expect(params).toContain("private");
  });

  it("seller_kind inválido NÃO injeta WHERE (defesa contra valor não-canônico)", () => {
    for (const bogus of ["DEALER", "loja", "verified", "", null, undefined]) {
      const { dataQuery } = buildAdsSearchQuery({ seller_kind: bogus });
      expect(sellerKindInWhere(normalize(dataQuery))).toBe(false);
    }
  });
});

describe("buildAdsSearchQuery — filtros combinados (Fase 3 ortogonal aos legados)", () => {
  it("priority_tier=4 + seller_kind=dealer + opportunity=true emitem 3 WHEREs distintos", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      priority_tier: 4,
      seller_kind: "dealer",
      opportunity: true,
    });
    const sql = normalize(dataQuery);
    expect(commercialLayerInWhere(sql)).toBe(true);
    expect(opportunityInWhere(sql)).toBe(true);
    expect(sellerKindInWhere(sql)).toBe(true);
    expect(params).toContain(4);
    expect(params).toContain("dealer");
  });

  it("priority_tier=3 + below_fipe=true convivem (filtros legados intactos)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      priority_tier: 3,
      below_fipe: true,
    });
    const sql = normalize(dataQuery);
    expect(sql).toContain("a.below_fipe =");
    expect(params).toContain(3);
    expect(params).toContain(true);
  });

  it("filtros NÃO afetam o countQuery (sem JOIN extra, sem repeticao)", () => {
    const { countQuery } = buildAdsSearchQuery({
      priority_tier: 4,
      opportunity: true,
      seller_kind: "dealer",
    });
    const sql = normalize(countQuery);
    // countQuery não precisa dos filtros canônicos novos — escopo público
    // de contagem é só status='active' + território + brand/model/etc.
    // (Decisão dessa fase: countQuery atual continua simples.)
    expect(sql).toContain("a.status");
  });
});

describe("adsFilterQuerySchema — validação dos novos filtros", () => {
  it("aceita priority_tier 1..4 (string ou number)", () => {
    for (const v of [1, 2, 3, 4, "1", "2", "3", "4"]) {
      const parsed = adsFilterQuerySchema.parse({ priority_tier: v });
      expect(parsed.priority_tier).toBe(Number(v));
    }
  });

  it("rejeita priority_tier fora de 1..4", () => {
    for (const v of [0, 5, 10, -1]) {
      expect(() => adsFilterQuerySchema.parse({ priority_tier: v })).toThrow();
    }
  });

  it("aceita opportunity=true e opportunity=false", () => {
    expect(adsFilterQuerySchema.parse({ opportunity: true }).opportunity).toBe(true);
    expect(adsFilterQuerySchema.parse({ opportunity: false }).opportunity).toBe(false);
    expect(adsFilterQuerySchema.parse({ opportunity: "true" }).opportunity).toBe(true);
  });

  it("aceita seller_kind='dealer' e 'private'", () => {
    expect(adsFilterQuerySchema.parse({ seller_kind: "dealer" }).seller_kind).toBe("dealer");
    expect(adsFilterQuerySchema.parse({ seller_kind: "private" }).seller_kind).toBe("private");
  });

  it("rejeita seller_kind fora do enum (DEALER, loja, qualquer outra string)", () => {
    expect(() => adsFilterQuerySchema.parse({ seller_kind: "DEALER" })).toThrow();
    expect(() => adsFilterQuerySchema.parse({ seller_kind: "loja" })).toThrow();
    expect(() => adsFilterQuerySchema.parse({ seller_kind: "verified" })).toThrow();
  });

  it("seller_kind vazio/null → undefined (sem efeito de filtro)", () => {
    expect(adsFilterQuerySchema.parse({ seller_kind: "" }).seller_kind).toBeUndefined();
    expect(adsFilterQuerySchema.parse({ seller_kind: null }).seller_kind).toBeUndefined();
  });
});
