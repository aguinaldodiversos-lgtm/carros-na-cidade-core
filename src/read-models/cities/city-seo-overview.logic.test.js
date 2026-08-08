import { describe, it, expect } from "vitest";

import {
  buildBrandEntities,
  buildCommercialModelEntities,
  buildDealerEntities,
  buildFacetEntities,
  buildNearbyCities,
  buildPriceStats,
  PRICE_STATS_MIN_SAMPLE,
} from "./city-seo-overview.logic.js";
import { getSeoInventoryThresholds } from "./city-thresholds.js";

const T = getSeoInventoryThresholds();

/** Linhas espelhando o inventário ativo real de Atibaia (auditoria 2026-08-07). */
const ATIBAIA_MODEL_ROWS = [
  { brand: "GM - Chevrolet", model: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.", total: 2 },
  { brand: "GM - Chevrolet", model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.", total: 2 },
  { brand: "GM - Chevrolet", model: "ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.", total: 1 },
  { brand: "GM - Chevrolet", model: "ONIX HATCH 1.0 12V Flex 5p Mec.", total: 1 },
  { brand: "Fiat", model: "ARGO DRIVE 1.0 6V Flex", total: 2 },
  { brand: "Fiat", model: "PULSE DRIVE 1.3 8V Flex Aut.", total: 1 },
  { brand: "Fiat", model: "PULSE AUDACE 1.0 Turbo 200 Flex Aut.", total: 1 },
  { brand: "Omoda", model: "5 Luxury 1.5 TB FWD", total: 1 },
];

describe("buildBrandEntities", () => {
  it("canonicaliza a marca FIPE e soma variações que colapsam no mesmo slug", () => {
    const brands = buildBrandEntities(
      [
        { brand: "GM - Chevrolet", total: 4, min_price: 60000 },
        { brand: "Chevrolet", total: 2, min_price: 55000 },
        { brand: "Fiat", total: 7, min_price: 50000 },
      ],
      "atibaia-sp"
    );

    const chevrolet = brands.find((b) => b.slug === "chevrolet");
    expect(chevrolet.activeAds).toBe(6);
    expect(chevrolet.label).toBe("Chevrolet");
    expect(chevrolet.minPrice).toBe(55000);
    expect(chevrolet.path).toBe("/cidade/atibaia-sp/marca/chevrolet");
  });

  it("qualifica pelo limiar central da família 'brand'", () => {
    const brands = buildBrandEntities(
      [
        { brand: "Fiat", total: T.brand },
        { brand: "Jeep", total: T.brand - 1 },
      ],
      "atibaia-sp"
    );

    expect(brands.find((b) => b.slug === "fiat").qualified).toBe(true);
    expect(brands.find((b) => b.slug === "jeep").qualified).toBe(false);
  });

  it("normaliza a grafia FIPE da Volkswagen no rótulo exibido", () => {
    const [vw] = buildBrandEntities([{ brand: "VW - VolksWagen", total: 4 }], "atibaia-sp");
    expect(vw.slug).toBe("volkswagen");
    expect(vw.label).toBe("Volkswagen");
  });
});

describe("buildCommercialModelEntities", () => {
  it("colapsa as 4 versões FIPE do Onix numa entidade só", () => {
    const { models } = buildCommercialModelEntities(ATIBAIA_MODEL_ROWS, "atibaia-sp");
    const onix = models.filter((m) => m.slug === "onix");

    expect(onix.length).toBe(1);
    expect(onix[0].activeAds).toBe(6);
    expect(onix[0].label).toBe("Onix");
    expect(onix[0].fipeVersions.length).toBe(4);
    expect(onix[0].path).toBe("/cidade/atibaia-sp/marca/chevrolet/modelo/onix");
  });

  it("agrupar pela descrição FIPE crua daria 4 clusters abaixo do limiar", () => {
    // Prova de que a camada de taxonomia é o que torna a página de modelo
    // possível: sem ela, nenhum dos quatro recortes chega ao limiar.
    const rawOnixRows = ATIBAIA_MODEL_ROWS.filter((r) => r.model.startsWith("ONIX"));
    expect(rawOnixRows.length).toBe(4);
    for (const row of rawOnixRows) expect(row.total).toBeLessThan(T.model);
  });

  it("soma Pulse (duas versões) e mantém marca correta", () => {
    const { models } = buildCommercialModelEntities(ATIBAIA_MODEL_ROWS, "atibaia-sp");
    const pulse = models.find((m) => m.slug === "pulse");
    expect(pulse.activeAds).toBe(2);
    expect(pulse.brandSlug).toBe("fiat");
    expect(pulse.qualified).toBe(2 >= T.model);
  });

  it("não cria a entidade '5' para o Omoda", () => {
    const { models } = buildCommercialModelEntities(ATIBAIA_MODEL_ROWS, "atibaia-sp");
    expect(models.some((m) => m.slug === "5")).toBe(false);
    expect(models.find((m) => m.brandSlug === "omoda").label).toBe("Omoda 5");
  });

  it("contabiliza (em vez de descartar) anúncios sem modelo derivável", () => {
    const { models, unresolved } = buildCommercialModelEntities(
      [{ brand: "Fiat", model: "1.0 Flex 8V", total: 3 }],
      "atibaia-sp"
    );
    expect(models).toEqual([]);
    expect(unresolved).toBe(3);
  });

  it("qualifica pelo limiar central da família 'model'", () => {
    const { models } = buildCommercialModelEntities(
      [
        { brand: "Fiat", model: `Argo Drive 1.0`, total: T.model },
        { brand: "Fiat", model: `Mobi Like 1.0`, total: T.model - 1 },
      ],
      "atibaia-sp"
    );
    expect(models.find((m) => m.slug === "argo").qualified).toBe(true);
    expect(models.find((m) => m.slug === "mobi").qualified).toBe(false);
  });
});

describe("buildPriceStats — portão de qualidade estatística", () => {
  it("não publica estatística com amostra abaixo do mínimo", () => {
    const stats = buildPriceStats({
      active_ads: PRICE_STATS_MIN_SAMPLE - 1,
      min_price: 20000,
      max_price: 3000000,
      median_price: 30000,
      avg_price: 1016666,
    });
    expect(stats.publishable).toBe(false);
    // Os números continuam disponíveis para relatório interno.
    expect(stats.medianPrice).toBe(30000);
  });

  it("publica a partir da amostra mínima", () => {
    const stats = buildPriceStats({
      active_ads: PRICE_STATS_MIN_SAMPLE,
      min_price: 50000,
      max_price: 110000,
      median_price: 68000,
      avg_price: 72000,
    });
    expect(stats.publishable).toBe(true);
    expect(stats.medianPrice).toBe(68000);
  });

  it("não publica quando não há faixa de preço real", () => {
    const stats = buildPriceStats({ active_ads: 30, min_price: 0, max_price: 0 });
    expect(stats.publishable).toBe(false);
    expect(stats.minPrice).toBeNull();
  });

  it("cidade vazia devolve estatística vazia e não publicável", () => {
    const stats = buildPriceStats({ active_ads: 0 });
    expect(stats.publishable).toBe(false);
    expect(stats.sampleSize).toBe(0);
    expect(stats.medianPrice).toBeNull();
  });
});

describe("buildNearbyCities", () => {
  const members = [
    { slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP", distance_km: 22.4 },
    { slug: "jarinu-sp", name: "Jarinu", state: "SP", distance_km: 14.1 },
    { slug: "piracaia-sp", name: "Piracaia", state: "SP", distance_km: 18.9 },
  ];

  it("só inclui cidade vizinha com superfície pública própria", () => {
    const nearby = buildNearbyCities(members, [
      { city_slug: "braganca-paulista-sp", total: T.city },
      { city_slug: "jarinu-sp", total: T.city - 1 },
      // piracaia sem linha = 0 anúncios
    ]);

    expect(nearby.map((c) => c.slug)).toEqual(["braganca-paulista-sp"]);
    expect(nearby[0].path).toBe("/carros-em/braganca-paulista-sp");
  });

  it("ordena por distância crescente", () => {
    const nearby = buildNearbyCities(members, [
      { city_slug: "braganca-paulista-sp", total: 10 },
      { city_slug: "jarinu-sp", total: 10 },
      { city_slug: "piracaia-sp", total: 10 },
    ]);
    expect(nearby.map((c) => c.slug)).toEqual([
      "jarinu-sp",
      "piracaia-sp",
      "braganca-paulista-sp",
    ]);
  });

  it("vizinhança vazia quando nenhuma cidade tem estoque", () => {
    expect(buildNearbyCities(members, [])).toEqual([]);
  });
});

describe("buildFacetEntities", () => {
  it("qualifica carroceria/câmbio pelo limiar transversal (mais estrito)", () => {
    const facets = buildFacetEntities([
      { kind: "body_type", value: "hatch", total: T.bodyType },
      { kind: "body_type", value: "suv", total: T.bodyType - 1 },
      { kind: "transmission", value: "automatico", total: T.transmission },
      { kind: "fuel_type", value: "flex", total: 27 },
    ]);

    expect(facets.bodyTypes.find((f) => f.value === "hatch").qualified).toBe(true);
    expect(facets.bodyTypes.find((f) => f.value === "suv").qualified).toBe(false);
    expect(facets.transmissions[0].qualified).toBe(true);
    // Combustível não tem superfície SEO própria — nunca qualifica.
    expect(facets.fuelTypes[0].qualified).toBe(false);
  });

  it("o limiar transversal é ESTRITAMENTE mais exigente que o da cidade", () => {
    expect(T.bodyType).toBeGreaterThan(T.city);
    expect(T.transmission).toBeGreaterThan(T.city);
    expect(T.priceRange).toBeGreaterThan(T.city);
  });

  it("ignora valores vazios", () => {
    const facets = buildFacetEntities([{ kind: "body_type", value: "", total: 5 }]);
    expect(facets.bodyTypes).toEqual([]);
  });
});

describe("buildDealerEntities", () => {
  it("expõe apenas nome, slug e contagem", () => {
    const dealers = buildDealerEntities([
      { id: 64, name: "Ittmotors", slug: "ittmotors-122", active_ads: 27, min_price: 50000 },
    ]);
    expect(dealers).toEqual([
      {
        slug: "ittmotors-122",
        name: "Ittmotors",
        activeAds: 27,
        minPrice: 50000,
        path: "/lojas/ittmotors-122",
      },
    ]);
    expect(Object.keys(dealers[0])).not.toContain("phone");
    expect(Object.keys(dealers[0])).not.toContain("email");
  });

  it("descarta lojista sem slug (link impossível)", () => {
    expect(buildDealerEntities([{ name: "Sem slug", slug: "", active_ads: 3 }])).toEqual([]);
  });
});

describe("independência territorial (lógica pura)", () => {
  it("o path de toda entidade carrega o slug da cidade recebida", () => {
    const brands = buildBrandEntities([{ brand: "Fiat", total: 5 }], "braganca-paulista-sp");
    const { models } = buildCommercialModelEntities(
      [{ brand: "Fiat", model: "ARGO DRIVE 1.0 6V Flex", total: 5 }],
      "braganca-paulista-sp"
    );

    expect(brands[0].path).toBe("/cidade/braganca-paulista-sp/marca/fiat");
    expect(models[0].path).toBe("/cidade/braganca-paulista-sp/marca/fiat/modelo/argo");
    expect(brands[0].path).not.toContain("atibaia");
    expect(models[0].path).not.toContain("atibaia");
  });

  it("cidade sem inventário devolve tudo vazio (nunca dado de outra cidade)", () => {
    expect(buildBrandEntities([], "braganca-paulista-sp")).toEqual([]);
    expect(buildCommercialModelEntities([], "braganca-paulista-sp").models).toEqual([]);
    expect(buildDealerEntities([])).toEqual([]);
  });
});
