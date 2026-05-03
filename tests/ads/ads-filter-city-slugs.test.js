import { describe, expect, it } from "vitest";
import { adsFilterQuerySchema } from "../../src/modules/ads/filters/ads-filter.schema.js";
import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";
import { ADS_FILTER_LIMITS } from "../../src/modules/ads/filters/ads-filter.constants.js";

function normalize(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

/**
 * Bypass do parser assíncrono (que importa inferAdsFiltersFromFreeQuery).
 * Aqui só queremos validar contrato Zod + builder SQL — não testar a
 * cadeia inteira do controller. Para testar a cadeia completa, ver os
 * tests de integração existentes.
 */
function parseAdsFiltersSync(raw) {
  const parsed = adsFilterQuerySchema.parse(raw);
  return parsed;
}

describe("city_slugs — schema (Zod)", () => {
  it("aceita CSV string e normaliza para array", () => {
    const out = parseAdsFiltersSync({ city_slugs: "atibaia-sp,santos-sp,jundiai-sp" });
    expect(out.city_slugs).toEqual(["atibaia-sp", "santos-sp", "jundiai-sp"]);
  });

  it("aceita array via chave repetida (Express/Next URL)", () => {
    const out = parseAdsFiltersSync({ city_slugs: ["atibaia-sp", "santos-sp"] });
    expect(out.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });

  it("normaliza para lowercase + trim em cada elemento", () => {
    const out = parseAdsFiltersSync({ city_slugs: "  ATIBAIA-SP , Santos-SP " });
    expect(out.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });

  it("remove duplicatas preservando primeira ocorrência", () => {
    const out = parseAdsFiltersSync({ city_slugs: "atibaia-sp,santos-sp,atibaia-sp" });
    expect(out.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });

  it("CSV vazio (string em branco) → city_slugs ausente do parsed (não filtra nada)", () => {
    const out = parseAdsFiltersSync({ city_slugs: "" });
    expect(out.city_slugs).toBeUndefined();
  });

  it("CSV só com vírgulas → undefined (preprocess colapsa vazio para sair como ausente)", () => {
    const out = parseAdsFiltersSync({ city_slugs: ",  ,," });
    expect(out.city_slugs).toBeUndefined();
  });

  it("rejeita slug com formato inválido (sem sufixo de UF)", () => {
    expect(() => parseAdsFiltersSync({ city_slugs: "atibaia,santos" })).toThrow();
  });

  it("rejeita slug com caracteres especiais (acentos, espaços, _)", () => {
    expect(() => parseAdsFiltersSync({ city_slugs: "são_paulo-sp" })).toThrow();
    expect(() => parseAdsFiltersSync({ city_slugs: "são paulo-sp" })).toThrow();
  });

  it("rejeita slug muito longo (acima de CITY_SLUG_MAX_LENGTH)", () => {
    const longSlug = "a".repeat(ADS_FILTER_LIMITS.CITY_SLUG_MAX_LENGTH + 1) + "-sp";
    expect(() => parseAdsFiltersSync({ city_slugs: longSlug })).toThrow();
  });

  it("rejeita lista acima do limite máximo (CITY_SLUGS_MAX = 30)", () => {
    const slugs = Array.from(
      { length: ADS_FILTER_LIMITS.CITY_SLUGS_MAX + 1 },
      (_, i) => `cidade-${i}-sp`
    );
    expect(() => parseAdsFiltersSync({ city_slugs: slugs })).toThrow();
  });

  it("aceita exatamente CITY_SLUGS_MAX slugs (boundary)", () => {
    const slugs = Array.from(
      { length: ADS_FILTER_LIMITS.CITY_SLUGS_MAX },
      (_, i) => `cidade-${i}-sp`
    );
    const out = parseAdsFiltersSync({ city_slugs: slugs });
    expect(out.city_slugs).toHaveLength(ADS_FILTER_LIMITS.CITY_SLUGS_MAX);
  });

  it("city_slugs ausente do input → ausente do parsed (compat total)", () => {
    const out = parseAdsFiltersSync({ city_slug: "atibaia-sp" });
    expect(out.city_slugs).toBeUndefined();
  });
});

describe("city_slugs — SQL builder", () => {
  it("city_slugs único elemento → emite c.slug = ANY($n) com array", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp"],
    });
    const sql = normalize(dataQuery);

    expect(sql).toContain("c.slug = ANY($");
    expect(params).toContainEqual(["atibaia-sp"]);
  });

  it("city_slugs múltiplos → emite ANY com array completo", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "bragança-paulista-sp", "jundiai-sp"],
    });
    const sql = normalize(dataQuery);

    expect(sql).toContain("c.slug = ANY($");
    const arrayParam = params.find((p) => Array.isArray(p));
    expect(arrayParam).toEqual(["atibaia-sp", "bragança-paulista-sp", "jundiai-sp"]);
  });

  it("city_slugs vazio ([]) → não emite ANY (filtro ignorado)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ city_slugs: [] });
    const sql = normalize(dataQuery);

    expect(sql).not.toContain("c.slug = ANY");
    // Nenhum param de array entra.
    expect(params.find((p) => Array.isArray(p))).toBeUndefined();
  });

  it("city_slugs ausente → builder mantém comportamento original", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    expect(sql).not.toContain("c.slug = ANY");
    expect(sql).toContain("a.status = 'active'");
  });

  it("city_slugs + state → ANY E filtro de UF (safety net)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp"],
      state: "SP",
    });
    const sql = normalize(dataQuery);

    expect(sql).toContain("c.slug = ANY($");
    expect(sql).toContain("UPPER(COALESCE(a.state, c.state)) = $");
    expect(params).toContainEqual(["atibaia-sp", "santos-sp"]);
    expect(params).toContain("SP");
  });

  it("city_slug (singular) tem precedência sobre city_slugs no builder também", () => {
    // Cenário em que ambos chegam ao builder — não deveria, pois normalizeTerritoryFilters
    // strip city_slugs quando city_slug está set, mas testamos defesa em profundidade.
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slug: "atibaia-sp",
      city_slugs: ["santos-sp", "jundiai-sp"],
    });
    const sql = normalize(dataQuery);

    expect(sql).toContain("c.slug = $");
    expect(sql).not.toContain("c.slug = ANY");
    expect(params).toContain("atibaia-sp");
    // O array NÃO deve ter sido empilhado.
    expect(params.find((p) => Array.isArray(p))).toBeUndefined();
  });

  it("comportamento de city_slug singular não muda: c.slug = $n (não ANY)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({ city_slug: "sao-paulo-sp" });
    const sql = normalize(dataQuery);
    expect(sql).toContain("c.slug = $");
    expect(sql).not.toContain("ANY");
    expect(params).toContain("sao-paulo-sp");
  });

  it("city_slugs convive com filtros não-territoriais (brand, price)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp"],
      brand: "Honda",
      price_max: 50000,
    });
    const sql = normalize(dataQuery);

    expect(sql).toContain("c.slug = ANY($");
    expect(sql).toContain("a.brand ILIKE $");
    expect(sql).toContain("a.price <= $");
    expect(params).toContainEqual(["atibaia-sp", "santos-sp"]);
    expect(params).toContain("%Honda%");
    expect(params).toContain(50000);
  });

  it("city_slugs NÃO emite city_id NEM city ILIKE (filtros antigos suprimidos pela nova rota)", () => {
    const { dataQuery } = buildAdsSearchQuery({ city_slugs: ["atibaia-sp"] });
    const sql = normalize(dataQuery);
    expect(sql).not.toContain("a.city_id =");
    expect(sql).not.toContain("a.city ILIKE");
  });
});

describe("city_slugs — payload público de /api/ads/search inalterado", () => {
  it("buildAdsSearchQuery sem city_slugs continua emitindo o mesmo SELECT (regressão)", () => {
    const { dataQuery, countQuery } = buildAdsSearchQuery({ city_slug: "sao-paulo-sp" });
    const sql = normalize(dataQuery);
    const count = normalize(countQuery);

    // Campos públicos preservados (não estamos adicionando colunas no SELECT).
    expect(sql).toContain("a.*");
    expect(sql).toContain("c.slug AS city_slug");
    expect(sql).toContain("adv.name        AS seller_name".replace(/\s+/g, " "));
    expect(sql).toContain("AS hybrid_score");

    // Count query tem o WHERE igual (sem coluna nova).
    expect(count).toContain("FROM ads a");
    expect(count).toContain("LEFT JOIN cities c");
  });

  it("dataQuery não inclui c.slug = ANY quando city_slugs ausente", () => {
    const { dataQuery } = buildAdsSearchQuery({ city_slug: "sao-paulo-sp" });
    expect(normalize(dataQuery)).not.toContain("c.slug = ANY");
  });
});
