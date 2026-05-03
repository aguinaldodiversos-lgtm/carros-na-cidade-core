import { describe, it, expect } from "vitest";
import {
  canonicalTerritoryForApi,
  parseAdsSearchFiltersFromSearchParams,
  buildSearchQueryString,
  clampPublicAdsSearchLimit,
  mergeSearchFilters,
  PUBLIC_ADS_SEARCH_CITY_SLUGS_MAX,
} from "./ads-search-url";

describe("canonicalTerritoryForApi", () => {
  it("prefers city_slug over city_id and city+state", () => {
    const result = canonicalTerritoryForApi({
      city_slug: "sao-paulo-sp",
      city_id: 123,
      city: "São Paulo",
      state: "SP",
    });
    expect(result).toEqual({ city_slug: "sao-paulo-sp" });
  });

  it("falls back to city_id when no slug", () => {
    const result = canonicalTerritoryForApi({
      city_id: 123,
      city: "São Paulo",
      state: "SP",
    });
    expect(result).toEqual({ city_id: 123 });
  });

  it("falls back to city+state when no slug or id", () => {
    const result = canonicalTerritoryForApi({
      city: "São Paulo",
      state: "SP",
    });
    expect(result).toEqual({ city: "São Paulo", state: "SP" });
  });

  it("returns empty when no territory info", () => {
    expect(canonicalTerritoryForApi({})).toEqual({});
  });

  it("trims whitespace from slug", () => {
    const result = canonicalTerritoryForApi({ city_slug: "  sao-paulo-sp  " });
    expect(result).toEqual({ city_slug: "sao-paulo-sp" });
  });
});

describe("clampPublicAdsSearchLimit", () => {
  it("clamps to max 50", () => {
    expect(clampPublicAdsSearchLimit(100)).toBe(50);
    expect(clampPublicAdsSearchLimit(50)).toBe(50);
    expect(clampPublicAdsSearchLimit(20)).toBe(20);
  });

  it("clamps to min 1", () => {
    expect(clampPublicAdsSearchLimit(0)).toBe(1);
    expect(clampPublicAdsSearchLimit(-5)).toBe(1);
  });

  it("truncates decimals", () => {
    expect(clampPublicAdsSearchLimit(20.7)).toBe(20);
  });
});

describe("parseAdsSearchFiltersFromSearchParams", () => {
  function makeParams(obj: Record<string, string>) {
    return new URLSearchParams(obj);
  }

  it("parses standard filters", () => {
    const params = makeParams({
      q: "uno",
      brand: "Fiat",
      city_slug: "campinas-sp",
      page: "2",
      limit: "20",
      sort: "price_asc",
    });

    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.q).toBe("uno");
    expect(result.brand).toBe("Fiat");
    expect(result.city_slug).toBe("campinas-sp");
    expect(result.page).toBe(2);
    expect(result.limit).toBe(20);
    expect(result.sort).toBe("price_asc");
  });

  it("defaults page to 1 and sort to relevance", () => {
    const result = parseAdsSearchFiltersFromSearchParams(makeParams({}));
    expect(result.page).toBe(1);
    expect(result.sort).toBe("relevance");
  });

  it("handles below_fipe boolean", () => {
    expect(
      parseAdsSearchFiltersFromSearchParams(makeParams({ below_fipe: "true" })).below_fipe
    ).toBe(true);
    expect(
      parseAdsSearchFiltersFromSearchParams(makeParams({ below_fipe: "false" })).below_fipe
    ).toBe(false);
  });

  it("merges highlight and highlight_only", () => {
    expect(
      parseAdsSearchFiltersFromSearchParams(makeParams({ highlight: "true" })).highlight_only
    ).toBe(true);
    expect(
      parseAdsSearchFiltersFromSearchParams(makeParams({ highlight_only: "true" })).highlight_only
    ).toBe(true);
  });

  it("accepts price_min/price_max aliases", () => {
    const result = parseAdsSearchFiltersFromSearchParams(
      makeParams({ price_min: "10000", price_max: "50000" })
    );
    expect(result.min_price).toBe(10000);
    expect(result.max_price).toBe(50000);
  });
});

describe("buildSearchQueryString", () => {
  it("builds query with territory canonicalization", () => {
    const qs = buildSearchQueryString({
      brand: "Fiat",
      city_slug: "campinas-sp",
      city_id: 123,
      page: 1,
    });
    expect(qs).toContain("brand=Fiat");
    expect(qs).toContain("city_slug=campinas-sp");
    expect(qs).not.toContain("city_id");
  });

  it("skips undefined/null values", () => {
    const qs = buildSearchQueryString({
      brand: "Fiat",
      model: undefined,
    });
    expect(qs).toContain("brand=Fiat");
    expect(qs).not.toContain("model");
  });
});

describe("mergeSearchFilters", () => {
  it("merges patch over current", () => {
    const result = mergeSearchFilters({ brand: "Fiat", page: 1 }, { brand: "VW", page: 2 });
    expect(result.brand).toBe("VW");
    expect(result.page).toBe(2);
  });

  it("removes undefined/null/empty values", () => {
    const result = mergeSearchFilters({ brand: "Fiat", model: "Uno" }, { model: undefined });
    expect(result.brand).toBe("Fiat");
    expect(result.model).toBeUndefined();
  });
});

/**
 * city_slugs — preparação interna para Página Regional (commit 0ebd7de4).
 *
 * Convenção: city_slugs[0] = cidade-base. A ordem é semanticamente
 * significativa porque o backend dá +60 pts de boost ao primeiro slug.
 */
describe("parseAdsSearchFiltersFromSearchParams — city_slugs", () => {
  it("aceita CSV: ?city_slugs=atibaia-sp,bragança-paulista-sp", () => {
    // O regex CITY_SLUG_PATTERN não aceita 'ç' — bragança vira inválido
    // e é silenciosamente ignorado. Usamos slugs canônicos no test.
    const params = new URLSearchParams("city_slugs=atibaia-sp,santos-sp");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });

  it("aceita chaves repetidas: ?city_slugs=a&city_slugs=b (URLSearchParams.getAll)", () => {
    const params = new URLSearchParams();
    params.append("city_slugs", "atibaia-sp");
    params.append("city_slugs", "santos-sp");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });

  it("aceita misto: chave repetida onde alguma entrada é CSV", () => {
    const params = new URLSearchParams();
    params.append("city_slugs", "atibaia-sp,santos-sp");
    params.append("city_slugs", "jundiai-sp");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["atibaia-sp", "santos-sp", "jundiai-sp"]);
  });

  it("normaliza para lowercase + trim", () => {
    const params = new URLSearchParams("city_slugs=  ATIBAIA-SP , Santos-SP ");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });

  it("dedup preservando primeira ocorrência (ordem importa para cidade-base)", () => {
    const params = new URLSearchParams("city_slugs=atibaia-sp,santos-sp,atibaia-sp,jundiai-sp");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["atibaia-sp", "santos-sp", "jundiai-sp"]);
    // Confirma que atibaia-sp continua sendo o [0] (cidade-base preservada).
    expect(result.city_slugs?.[0]).toBe("atibaia-sp");
  });

  it("remove vazios entre vírgulas (?city_slugs=a,,b,)", () => {
    const params = new URLSearchParams("city_slugs=atibaia-sp,,santos-sp,");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });

  it("CSV totalmente vazio (?city_slugs=) → undefined (campo omitido)", () => {
    const params = new URLSearchParams("city_slugs=");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toBeUndefined();
  });

  it("CSV só com vírgulas (?city_slugs=,,,) → undefined", () => {
    const params = new URLSearchParams("city_slugs=,,,");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toBeUndefined();
  });

  it("ausente → undefined (compat: páginas atuais não enviam city_slugs)", () => {
    const params = new URLSearchParams("brand=Honda");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toBeUndefined();
  });

  it("ignora silenciosamente slug com formato inválido (sem -uf)", () => {
    const params = new URLSearchParams("city_slugs=atibaia,santos-sp");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["santos-sp"]);
  });

  it("ignora silenciosamente slug com caracteres especiais (acento, espaço)", () => {
    const params = new URLSearchParams();
    params.set("city_slugs", "são paulo-sp,santos-sp");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toEqual(["santos-sp"]);
  });

  it("se TODOS os slugs são inválidos → undefined", () => {
    const params = new URLSearchParams("city_slugs=invalido,outro_invalido,xyz");
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toBeUndefined();
  });

  it("respeita cap de PUBLIC_ADS_SEARCH_CITY_SLUGS_MAX (30)", () => {
    const slugs = Array.from({ length: 50 }, (_, i) => `cidade-${i}-sp`);
    const params = new URLSearchParams(`city_slugs=${slugs.join(",")}`);
    const result = parseAdsSearchFiltersFromSearchParams(params);
    expect(result.city_slugs).toHaveLength(PUBLIC_ADS_SEARCH_CITY_SLUGS_MAX);
    // Os primeiros 30 são preservados (ordem importa).
    expect(result.city_slugs?.[0]).toBe("cidade-0-sp");
    expect(result.city_slugs?.[29]).toBe("cidade-29-sp");
  });

  it("fallback para reader sem getAll: ainda parseia CSV via .get apenas", () => {
    // Simula um wrapper minimalista (ex.: toReader em /anuncios/page.tsx)
    // que não implementa getAll. Resultado: parser cai no `.get(name)` único
    // e ainda divide por vírgula. Chaves repetidas seriam perdidas, mas CSV
    // funciona — comportamento documentado.
    const minimalReader: { get(name: string): string | null } = {
      get(name) {
        if (name === "city_slugs") return "atibaia-sp,santos-sp";
        return null;
      },
    };
    const result = parseAdsSearchFiltersFromSearchParams(minimalReader);
    expect(result.city_slugs).toEqual(["atibaia-sp", "santos-sp"]);
  });
});

describe("buildSearchQueryString — city_slugs", () => {
  it("emite CSV: city_slugs=a-sp,b-sp,c-sp", () => {
    const qs = buildSearchQueryString({
      city_slugs: ["atibaia-sp", "santos-sp", "jundiai-sp"],
    });
    expect(qs).toContain("city_slugs=atibaia-sp%2Csantos-sp%2Cjundiai-sp");
  });

  it("re-normaliza array com duplicatas/maiusculas/espacos no input do caller", () => {
    const qs = buildSearchQueryString({
      city_slugs: ["  ATIBAIA-SP  ", "santos-sp", "atibaia-sp"],
    });
    expect(qs).toContain("city_slugs=atibaia-sp%2Csantos-sp");
  });

  it("omite city_slugs quando undefined", () => {
    const qs = buildSearchQueryString({ brand: "Honda" });
    expect(qs).not.toContain("city_slugs=");
  });

  it("omite city_slugs quando array vazio []", () => {
    const qs = buildSearchQueryString({ city_slugs: [] });
    expect(qs).not.toContain("city_slugs=");
  });

  it("omite city_slugs quando todos elementos são vazios/whitespace", () => {
    const qs = buildSearchQueryString({ city_slugs: ["", "  ", ""] });
    expect(qs).not.toContain("city_slugs=");
  });

  it("não trata city_slugs via Object.entries genérico (skipTerritory cobre)", () => {
    // Defesa contra serialização acidental por toString() do array.
    const qs = buildSearchQueryString({
      city_slugs: ["atibaia-sp", "santos-sp"],
      brand: "Honda",
    });
    // Apenas UMA emissão de city_slugs (CSV único), não múltiplas.
    expect((qs.match(/city_slugs=/g) || []).length).toBe(1);
    expect(qs).toContain("brand=Honda");
  });

  it("convive com city_slug singular sem conflito (ambos emitidos)", () => {
    const qs = buildSearchQueryString({
      city_slug: "atibaia-sp",
      city_slugs: ["atibaia-sp", "santos-sp"],
    });
    // Backend resolve precedência (parser strip city_slugs quando city_slug
    // está set). O frontend emite ambos para preservar input do caller.
    expect(qs).toContain("city_slug=atibaia-sp");
    expect(qs).toContain("city_slugs=atibaia-sp%2Csantos-sp");
  });
});

describe("city_slugs — roundtrip build → parse", () => {
  it("array de 3 slugs sobrevive ao roundtrip preservando ordem", () => {
    const original = ["atibaia-sp", "santos-sp", "jundiai-sp"];
    const qs = buildSearchQueryString({ city_slugs: original });
    const params = new URLSearchParams(qs);
    const parsed = parseAdsSearchFiltersFromSearchParams(params);
    expect(parsed.city_slugs).toEqual(original);
    expect(parsed.city_slugs?.[0]).toBe("atibaia-sp"); // base preservada
  });

  it("array de 1 slug sobrevive ao roundtrip", () => {
    const qs = buildSearchQueryString({ city_slugs: ["atibaia-sp"] });
    const parsed = parseAdsSearchFiltersFromSearchParams(new URLSearchParams(qs));
    expect(parsed.city_slugs).toEqual(["atibaia-sp"]);
  });

  it("filtros existentes (city_slug + brand) intactos em coexistência", () => {
    const qs = buildSearchQueryString({
      city_slug: "sao-paulo-sp",
      brand: "Honda",
      page: 2,
    });
    const parsed = parseAdsSearchFiltersFromSearchParams(new URLSearchParams(qs));
    expect(parsed.city_slug).toBe("sao-paulo-sp");
    expect(parsed.brand).toBe("Honda");
    expect(parsed.page).toBe(2);
    expect(parsed.city_slugs).toBeUndefined();
  });

  it("regressão: city_slug singular não é afetado pela presença do tipo city_slugs", () => {
    const qs = buildSearchQueryString({ city_slug: "atibaia-sp" });
    const parsed = parseAdsSearchFiltersFromSearchParams(new URLSearchParams(qs));
    expect(parsed.city_slug).toBe("atibaia-sp");
    expect(parsed.city_slugs).toBeUndefined();
  });
});
