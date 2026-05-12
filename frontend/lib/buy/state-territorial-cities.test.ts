import { describe, expect, it } from "vitest";
import { CITY_SLUG_REGEX } from "@/lib/city/city-from-pathname";
import { getStateCuratedCities, DEFAULT_CURATED_LIMIT } from "./state-territorial-cities";

describe("getStateCuratedCities", () => {
  it("retorna cidades em SP, incluindo Atibaia (gap reportado na auditoria)", () => {
    const cities = getStateCuratedCities("sp");
    expect(cities.length).toBeGreaterThan(0);
    const slugs = cities.map((c) => c.slug);
    expect(slugs).toContain("atibaia-sp");
    expect(slugs).toContain("sao-paulo-sp");
    expect(slugs).toContain("campinas-sp");
  });

  it("aceita UF em uppercase e lowercase", () => {
    const lower = getStateCuratedCities("sp");
    const upper = getStateCuratedCities("SP");
    expect(upper.map((c) => c.slug)).toEqual(lower.map((c) => c.slug));
  });

  it("normaliza slugs com acento residual (defesa contra cedilha no map)", () => {
    const cities = getStateCuratedCities("sp");
    // O map literal carrega "bragança-paulista-sp" para nome bonito;
    // o getter precisa devolver "braganca-paulista-sp" (canônico backend).
    const braganca = cities.find((c) => c.name.startsWith("Bragança"));
    expect(braganca).toBeDefined();
    expect(braganca?.slug).toBe("braganca-paulista-sp");
  });

  it("todos os slugs casam com o regex canônico de slug territorial", () => {
    for (const uf of ["sp", "rj", "mg"]) {
      const cities = getStateCuratedCities(uf);
      for (const c of cities) {
        expect(CITY_SLUG_REGEX.test(c.slug), `${uf}: ${c.slug}`).toBe(true);
      }
    }
  });

  it("UF não mapeado retorna lista vazia (caller suprime bloco)", () => {
    expect(getStateCuratedCities("zz")).toEqual([]);
    expect(getStateCuratedCities("")).toEqual([]);
    expect(getStateCuratedCities(null)).toEqual([]);
    expect(getStateCuratedCities(undefined)).toEqual([]);
  });

  it("respeita o limite padrão DEFAULT_CURATED_LIMIT", () => {
    const cities = getStateCuratedCities("sp");
    expect(cities.length).toBeLessThanOrEqual(DEFAULT_CURATED_LIMIT);
  });

  it("aceita limit custom (truncamento da lista)", () => {
    const cities = getStateCuratedCities("sp", 3);
    expect(cities).toHaveLength(3);
    // Capital primeiro (decisão deliberada do map).
    expect(cities[0].slug).toBe("sao-paulo-sp");
  });

  it("limit 0 retorna vazio (não negativo, não NaN)", () => {
    expect(getStateCuratedCities("sp", 0)).toEqual([]);
    expect(getStateCuratedCities("sp", -1)).toEqual([]);
  });

  it("nomes preservam acentos (display)", () => {
    const cities = getStateCuratedCities("sp");
    expect(cities.find((c) => c.slug === "sao-paulo-sp")?.name).toBe("São Paulo");
    expect(cities.find((c) => c.slug === "ribeirao-preto-sp")?.name).toBe("Ribeirão Preto");
  });
});
