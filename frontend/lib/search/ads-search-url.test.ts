import { describe, it, expect } from "vitest";
import {
  canonicalTerritoryForApi,
  parseAdsSearchFiltersFromSearchParams,
  buildSearchQueryString,
  clampPublicAdsSearchLimit,
  mergeSearchFilters,
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
    expect(parseAdsSearchFiltersFromSearchParams(makeParams({ below_fipe: "true" })).below_fipe).toBe(true);
    expect(parseAdsSearchFiltersFromSearchParams(makeParams({ below_fipe: "false" })).below_fipe).toBe(false);
  });

  it("merges highlight and highlight_only", () => {
    expect(parseAdsSearchFiltersFromSearchParams(makeParams({ highlight: "true" })).highlight_only).toBe(true);
    expect(parseAdsSearchFiltersFromSearchParams(makeParams({ highlight_only: "true" })).highlight_only).toBe(true);
  });

  it("accepts price_min/price_max aliases", () => {
    const result = parseAdsSearchFiltersFromSearchParams(makeParams({ price_min: "10000", price_max: "50000" }));
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
    const result = mergeSearchFilters(
      { brand: "Fiat", page: 1 },
      { brand: "VW", page: 2 }
    );
    expect(result.brand).toBe("VW");
    expect(result.page).toBe(2);
  });

  it("removes undefined/null/empty values", () => {
    const result = mergeSearchFilters(
      { brand: "Fiat", model: "Uno" },
      { model: undefined }
    );
    expect(result.brand).toBe("Fiat");
    expect(result.model).toBeUndefined();
  });
});
