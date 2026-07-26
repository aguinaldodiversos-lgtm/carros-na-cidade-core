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

/**
 * Igual a `whereSection`, mas tolera SQL sem ORDER BY — caso do countQuery,
 * onde o WHERE vai até o fim da string. Usar `whereSection` num countQuery
 * devolve "" e faria qualquer asserção sobre o WHERE passar vacuamente.
 */
function whereSectionAnywhere(sql) {
  const whereIdx = sql.indexOf("WHERE");
  if (whereIdx < 0) return "";
  const orderByIdx = sql.indexOf("ORDER BY", whereIdx);
  return orderByIdx > whereIdx ? sql.slice(whereIdx, orderByIdx) : sql.slice(whereIdx);
}

function commercialLayerInWhere(sql) {
  // commercialLayerExpr (pós-039) é GREATEST(..., COALESCE(sp.weight, 1)).
  // `COALESCE(sp.weight, 1)` é único do commercialLayerExpr nessa seção.
  return /COALESCE\(sp\.weight, 1\)/.test(whereSection(sql));
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

  /**
   * REGRESSÃO 2026-07-26 — o countQuery COMPARTILHA o whereClause com o
   * dataQuery, então os filtros canônicos entram nele também.
   *
   * Este teste antes se chamava "filtros NÃO afetam o countQuery (sem JOIN
   * extra, sem repeticao)" e assertava só `toContain("a.status")`. A
   * premissa era falsa e a asserção não cobria nada: `?seller_kind=` e
   * `?priority_tier=` explodiam em produção com "missing FROM-clause entry
   * for table u/sp" — safeMode engolia o erro e devolvia total:0 — com o
   * teste verde. Segundo episódio do mesmo modo de falha (o primeiro foi
   * `adv` em 2026-05-24).
   *
   * Agora asserta o CONTRATO real: todo alias que a expressão canônica
   * referencia no WHERE tem que ter JOIN no countQuery.
   */
  const countQueryJoinCases = [
    {
      filters: { seller_kind: "dealer" },
      // sellerKindExpr → u.document_type
      alias: "u",
      join: /LEFT JOIN users u ON u\.id = adv\.user_id/,
    },
    {
      filters: { seller_kind: "private" },
      alias: "u",
      join: /LEFT JOIN users u ON u\.id = adv\.user_id/,
    },
    {
      filters: { priority_tier: 4 },
      // commercialLayerExpr → sp.weight (e sp depende de u.plan_id)
      alias: "sp",
      join: /LEFT JOIN subscription_plans sp ON sp\.id = u\.plan_id/,
    },
    {
      filters: { priority_tier: 1 },
      alias: "sp",
      join: /LEFT JOIN subscription_plans sp ON sp\.id = u\.plan_id/,
    },
  ];

  for (const { filters, alias, join } of countQueryJoinCases) {
    const label = JSON.stringify(filters);
    it(`countQuery com ${label} declara o JOIN de "${alias}" que o WHERE referencia`, () => {
      const { countQuery } = buildAdsSearchQuery(filters);
      const sql = normalize(countQuery);

      // O alias TEM que aparecer no WHERE (prova que o filtro chegou aqui —
      // se um dia deixar de chegar, o caso vira vacuously true sem isto).
      expect(whereSectionAnywhere(sql)).toMatch(new RegExp(`\\b${alias}\\.`));
      expect(sql).toMatch(join);
      expect(sql).toContain("a.status");
    });
  }

  /**
   * Rede genérica: derivada do WHERE, não de uma lista escrita à mão. Um
   * filtro futuro que traga um alias novo passa a ser coberto sem editar o
   * teste — o que faltou nos dois episódios (`adv` 2026-05-24, `u`/`sp`
   * 2026-07-26).
   */
  it("todo alias usado no WHERE tem JOIN em AMBAS as queries (data + count)", () => {
    // Combinação máxima: força todo alias possível para dentro do WHERE.
    const filters = {
      priority_tier: 4,
      opportunity: true,
      seller_kind: "dealer",
      below_fipe: true,
      city_slug: "atibaia-sp",
      brand: "fiat",
    };
    const { dataQuery, countQuery } = buildAdsSearchQuery(filters);
    const dataSql = normalize(dataQuery);
    const countSql = normalize(countQuery);

    const aliasesNoWhere = new Set(
      [...whereSectionAnywhere(dataSql).matchAll(/\b([a-z]{1,4})\.[a-z_]/g)].map((m) => m[1])
    );

    // Sanidade: se a extração não achar u e sp, o teste não está provando
    // nada — foi assim que a versão antiga passou com a produção quebrada.
    expect([...aliasesNoWhere].sort()).toEqual(expect.arrayContaining(["adv", "sp", "u"]));

    for (const alias of aliasesNoWhere) {
      if (alias === "a") continue; // `ads a` é o FROM, não é JOIN
      const join = new RegExp(`JOIN \\w+ ${alias} ON`);
      expect(dataSql, `alias "${alias}" no WHERE mas sem JOIN no dataQuery`).toMatch(join);
      expect(countSql, `alias "${alias}" no WHERE mas sem JOIN no countQuery`).toMatch(join);
    }
  });

  it("opportunity não exige JOIN novo (só colunas de ads)", () => {
    const { countQuery } = buildAdsSearchQuery({ opportunity: true });
    const where = whereSectionAnywhere(normalize(countQuery));
    expect(where).toMatch(/price <= a\.fipe_reference_value \* 0\.9/);
    expect(where).not.toMatch(/\bsp\./);
    expect(where).not.toMatch(/\bu\./);
  });

  // ──────────────────────────────────────────────────────────────────
  // Fase 3.3 — regressão: anúncio blocked não pode vazar no público
  // ──────────────────────────────────────────────────────────────────
  it("status SEMPRE filtrado por 'active' (defesa contra regressão Fase 3.3)", () => {
    const cases = [{}, { city_slug: "atibaia-sp" }, { brand: "honda" }, { highlight_only: true }];
    for (const filters of cases) {
      const { dataQuery, countQuery } = buildAdsSearchQuery(filters);
      // dataQuery e countQuery devem incluir literalmente "status = 'active'".
      // Nunca aceitar 'status != deleted' / 'status IN (...amplo...)' nem filtro ausente
      // — anúncios blocked/paused/rejected nunca podem aparecer em listagem pública.
      expect(normalize(dataQuery)).toMatch(/a\.status\s*=\s*'active'/i);
      expect(normalize(countQuery)).toMatch(/a\.status\s*=\s*'active'/i);
      expect(normalize(dataQuery)).not.toMatch(/a\.status\s*!=\s*'deleted'/i);
      expect(normalize(dataQuery)).not.toMatch(/a\.status\s+IN\s*\(/i);
    }
  });

  it("anúncio blocked: query NUNCA contém status='blocked' como aceito", () => {
    const { dataQuery } = buildAdsSearchQuery({ city_slug: "atibaia-sp" });
    const sql = normalize(dataQuery);
    expect(sql).not.toMatch(/status\s*=\s*'blocked'/i);
    expect(sql).not.toMatch(/status\s*=\s*'paused'/i);
    expect(sql).not.toMatch(/status\s*=\s*'rejected'/i);
  });

  // Fase 3.5 — regressão: archived nunca aparece no público
  it("anúncio archived: query NUNCA contém status='archived' como aceito", () => {
    const cases = [{}, { city_slug: "atibaia-sp" }, { highlight_only: true }];
    for (const filters of cases) {
      const { dataQuery, countQuery } = buildAdsSearchQuery(filters);
      expect(normalize(dataQuery)).not.toMatch(/status\s*=\s*'archived'/i);
      expect(normalize(countQuery)).not.toMatch(/status\s*=\s*'archived'/i);
    }
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
