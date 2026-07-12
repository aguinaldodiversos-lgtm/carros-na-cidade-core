import { describe, expect, it } from "vitest";

import { deriveHomeDiscovery, type SampleAd } from "./home-discovery";

function ad(partial: Partial<SampleAd>): SampleAd {
  return {
    price: null,
    year: null,
    brand: null,
    model: null,
    body_type: null,
    below_fipe: false,
    city: null,
    city_slug: null,
    ...partial,
  };
}

describe("deriveHomeDiscovery", () => {
  it("retorna tudo vazio sem anúncios ou sem UF", () => {
    expect(deriveHomeDiscovery([], "SP")).toEqual({
      profiles: [],
      models: [],
      priceBuckets: [],
      cities: [],
    });
    expect(
      deriveHomeDiscovery([ad({ price: 50000, city_slug: "atibaia-sp", city: "Atibaia" })], "")
    ).toEqual({
      profiles: [],
      models: [],
      priceBuckets: [],
      cities: [],
    });
  });

  it("deriva seções a partir de anúncios reais e nunca gera link sem lastro", () => {
    const ads: SampleAd[] = [
      ad({
        price: 30000,
        year: 2015,
        brand: "Fiat",
        model: "Mobi",
        body_type: "hatch",
        city: "Atibaia",
        city_slug: "atibaia-sp",
      }),
      ad({
        price: 65000,
        year: 2020,
        brand: "Fiat",
        model: "Argo",
        body_type: "suv",
        below_fipe: true,
        city: "Atibaia",
        city_slug: "atibaia-sp",
      }),
      ad({
        price: 120000,
        year: 2022,
        brand: "Jeep",
        model: "Compass",
        body_type: "suv",
        city: "Campinas",
        city_slug: "campinas-sp",
      }),
      // slug corrompido (sem UF válida) → deve ser descartado, nunca virar link.
      ad({
        price: 55000,
        year: 2019,
        brand: "VW",
        model: "Gol",
        city: "Cidade Ruim",
        city_slug: "saeo-paulo",
      }),
    ];

    const out = deriveHomeDiscovery(ads, "SP");

    // Cidades: só slugs válidos, ordenadas por contagem; "saeo-paulo" fora.
    expect(out.cities.map((c) => c.slug)).toEqual(["atibaia-sp", "campinas-sp"]);
    expect(out.cities.some((c) => c.slug === "saeo-paulo")).toBe(false);
    expect(out.cities[0].slug).toBe("atibaia-sp"); // 2 anúncios → primeiro

    // Faixas de preço: 30k→até-40, 65k→40-70, 120k→acima-100. Nada em 70-100.
    expect(out.priceBuckets.map((b) => b.key)).toEqual(["ate-40", "40-70", "acima-100"]);

    // Perfis: com esta amostra todos os 5 têm lastro.
    const profileKeys = out.profiles.map((p) => p.key);
    expect(profileKeys).toContain("primeiro-carro"); // 30k <= 50k
    expect(profileKeys).toContain("familia"); // há SUV
    expect(profileKeys).toContain("uber-99"); // 2020 & 65k
    expect(profileKeys).toContain("economicos"); // 30k <= 60k
    expect(profileKeys).toContain("abaixo-fipe"); // Argo below_fipe

    // Modelos: 4 anúncios com marca+modelo distintos (inclui o de slug ruim,
    // pois modelo não depende de cidade).
    expect(out.models.map((m) => m.label)).toContain("Fiat Mobi");
    expect(out.models.map((m) => m.label)).toContain("Jeep Compass");

    // Links de preço apontam para /comprar com state=SP.
    for (const b of out.priceBuckets) {
      expect(b.href.startsWith("/comprar?state=SP")).toBe(true);
    }
  });

  it("oculta perfis/faixas sem lastro na amostra", () => {
    // Só um carro caro, sem SUV, sem below_fipe.
    const ads: SampleAd[] = [
      ad({
        price: 85000,
        year: 2014,
        brand: "Toyota",
        model: "Corolla",
        body_type: "sedan",
        city: "Bauru",
        city_slug: "bauru-sp",
      }),
    ];
    const out = deriveHomeDiscovery(ads, "SP");
    const keys = out.profiles.map((p) => p.key);

    expect(keys).not.toContain("primeiro-carro"); // 85k > 50k
    expect(keys).not.toContain("economicos"); // 85k > 60k
    expect(keys).not.toContain("familia"); // sem SUV
    expect(keys).not.toContain("uber-99"); // 2014 < 2016
    expect(keys).not.toContain("abaixo-fipe"); // sem below_fipe
    // Só a faixa 70-100 (85k) existe.
    expect(out.priceBuckets.map((b) => b.key)).toEqual(["70-100"]);
  });
});
