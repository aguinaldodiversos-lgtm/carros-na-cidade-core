import { describe, it, expect } from "vitest";
import {
  buildTerritorialSeoContent,
  resolveTerritorialIndexation,
  DEFAULT_INDEX_THRESHOLDS,
  type TerritorialContentInput,
} from "./territorial-content-engine";

describe("resolveTerritorialIndexation (§3)", () => {
  it("cidade: >=3 ativos indexa; 1-2 não (salvo estratégica); 0 não", () => {
    const base = { entityType: "city", slug: "x", cityName: "X" } as TerritorialContentInput;
    expect(resolveTerritorialIndexation({ ...base, activeAds: 3 }).indexable).toBe(true);
    expect(resolveTerritorialIndexation({ ...base, activeAds: 2 }).indexable).toBe(false);
    expect(
      resolveTerritorialIndexation({ ...base, activeAds: 2, isStrategic: true }).indexable
    ).toBe(true);
    expect(resolveTerritorialIndexation({ ...base, activeAds: 0 }).indexable).toBe(false);
  });

  it("região: limiar 5", () => {
    const base = { entityType: "region", slug: "r" } as TerritorialContentInput;
    expect(resolveTerritorialIndexation({ ...base, activeAds: 5 }).indexable).toBe(true);
    expect(resolveTerritorialIndexation({ ...base, activeAds: 4 }).indexable).toBe(false);
  });

  it("abaixo da FIPE: >=2 ofertas; 1 só se estratégica; 0 não", () => {
    const base = { entityType: "below_fipe_city", slug: "x" } as TerritorialContentInput;
    expect(resolveTerritorialIndexation({ ...base, belowFipeAds: 2 }).indexable).toBe(true);
    expect(resolveTerritorialIndexation({ ...base, belowFipeAds: 1 }).indexable).toBe(false);
    expect(
      resolveTerritorialIndexation({ ...base, belowFipeAds: 1, isStrategic: true }).indexable
    ).toBe(true);
    expect(resolveTerritorialIndexation({ ...base, belowFipeAds: 0 }).indexable).toBe(false);
  });

  it("estado: indexa com inventário", () => {
    const base = { entityType: "state", slug: "sp", uf: "SP" } as TerritorialContentInput;
    expect(resolveTerritorialIndexation({ ...base, activeAds: 1 }).indexable).toBe(true);
    expect(resolveTerritorialIndexation({ ...base, activeAds: 0 }).indexable).toBe(false);
  });

  it("limiares são configuráveis", () => {
    const input = { entityType: "city", slug: "x", activeAds: 2 } as TerritorialContentInput;
    expect(
      resolveTerritorialIndexation(input, { ...DEFAULT_INDEX_THRESHOLDS, cityMinAds: 2 }).indexable
    ).toBe(true);
  });
});

describe("buildTerritorialSeoContent — São Paulo (exemplo §4)", () => {
  const content = buildTerritorialSeoContent({
    entityType: "city",
    slug: "sao-paulo-sp",
    uf: "SP",
    cityName: "São Paulo",
    activeAds: 1,
    belowFipeAds: 1,
    topBrands: [{ brand: "GM - Chevrolet", count: 1 }],
    avgPrice: null,
    minPrice: null,
  });

  it("h1 e título factuais", () => {
    expect(content.h1).toBe("Carros usados em São Paulo - SP");
    expect(content.title).toContain("São Paulo - SP");
    expect(content.title).toContain("1 anúncio");
  });

  it("intro reflete o exemplo do briefing (1 ativo, marca, abaixo da FIPE)", () => {
    expect(content.intro).toContain("Encontre carros usados em São Paulo - SP");
    expect(content.intro).toContain("Hoje há 1 anúncio ativo");
    expect(content.intro).toContain("GM - Chevrolet");
    expect(content.intro).toContain("abaixo da FIPE");
  });

  it("não inventa estatística: sem avgPrice, não cita preço médio", () => {
    expect(content.intro).not.toContain("preço médio");
    expect(content.stats.find((s) => s.label === "Preço médio")).toBeUndefined();
  });

  it("1 ativo → noindex (abaixo do limiar 3)", () => {
    expect(content.indexable).toBe(false);
    expect(content.robots).toEqual({ index: false, follow: true });
  });

  it("emite CollectionPage + BreadcrumbList + FAQPage", () => {
    const types = content.jsonLd.map((j) => j["@type"]);
    expect(types).toContain("CollectionPage");
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("FAQPage");
  });

  it("canonical absoluto para /carros-em/<slug>", () => {
    expect(content.canonicalUrl).toMatch(/\/carros-em\/sao-paulo-sp$/);
  });
});

describe("buildTerritorialSeoContent — Águas de Lindóia (região, exemplo §5)", () => {
  const content = buildTerritorialSeoContent({
    entityType: "region",
    slug: "aguas-de-lindoia-sp",
    uf: "SP",
    cityName: "Águas de Lindóia",
    regionName: "Águas de Lindóia",
    activeAds: 3,
    topBrands: [{ brand: "VW - VolksWagen" }, { brand: "GM - Chevrolet" }, { brand: "BYD" }],
  });

  it("intro regional com destaque de marcas", () => {
    expect(content.intro).toContain("Na região de Águas de Lindóia");
    expect(content.intro).toContain("Hoje há 3 anúncios ativos");
    expect(content.intro).toContain("VW - VolksWagen");
    expect(content.intro).toContain("BYD");
  });

  it("3 ativos < limiar 5 → noindex", () => {
    expect(content.indexable).toBe(false);
  });
});

describe("buildTerritorialSeoContent — abaixo da FIPE", () => {
  it("com >=2 ofertas → indexa e FAQ é a de FIPE", () => {
    const content = buildTerritorialSeoContent({
      entityType: "below_fipe_city",
      slug: "sao-paulo-sp",
      uf: "SP",
      cityName: "São Paulo",
      belowFipeAds: 4,
      avgPrice: 65000,
    });
    expect(content.indexable).toBe(true);
    expect(content.title).toContain("abaixo da FIPE");
    expect(content.intro).toContain("abaixo da Tabela FIPE");
    expect(content.intro).toContain("preço médio aproximado é");
    const faqText = content.faq.map((f) => f.question.toLowerCase()).join(" ");
    expect(faqText).toContain("laudo cautelar");
  });

  it("sem oferta real → noindex", () => {
    const content = buildTerritorialSeoContent({
      entityType: "below_fipe_city",
      slug: "x",
      cityName: "X",
      belowFipeAds: 0,
    });
    expect(content.indexable).toBe(false);
  });
});
