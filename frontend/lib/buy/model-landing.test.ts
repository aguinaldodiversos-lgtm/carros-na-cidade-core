import { describe, expect, it } from "vitest";

import type { AdItem, AdsSearchResponse } from "@/lib/search/ads-search";
import {
  buildInventorySentence,
  buildModelLandingBreadcrumbs,
  buildModelLandingCopy,
  buildModelLandingExploreLinks,
  buildModelLandingHref,
  buildModelLandingQuery,
  buildModelListingRequest,
  buildPopularBrandLinks,
  countActiveUserFilters,
  formatPriceRange,
  formatYearRange,
  hasRegionalResults,
  modelLandingPath,
  parseModelLandingFilters,
  resolveModelLandingIdentity,
  summarizeModelListing,
  type ModelLandingIdentity,
} from "./model-landing";

// Intl pt-BR separa "R$" do número com espaço não quebrável (U+00A0).
const brl = (text: string) => text.replace(/R\$ /g, "R$\u00a0");

const ATIBAIA_ONIX: ModelLandingIdentity = {
  citySlug: "atibaia-sp",
  cityName: "Atibaia",
  cityState: "SP",
  brandSlug: "chevrolet",
  brandName: "Chevrolet",
  modelSlug: "onix",
  modelName: "Onix",
};

const BRAGANCA_HB20: ModelLandingIdentity = {
  citySlug: "braganca-paulista-sp",
  cityName: "Bragança Paulista",
  cityState: "SP",
  brandSlug: "hyundai",
  brandName: "Hyundai",
  modelSlug: "hb20",
  modelName: "HB20",
};

function ad(partial: Partial<AdItem>): AdItem {
  return { id: Math.floor(Math.random() * 1e6), ...partial } as AdItem;
}

function response(data: AdItem[], extra: Partial<AdsSearchResponse> = {}): AdsSearchResponse {
  return {
    success: true,
    data,
    pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 },
    ...extra,
  };
}

describe("identidade e copy — um template para qualquer cidade + marca + modelo", () => {
  it("usa os rótulos reais do payload (acento, hífen, caixa do modelo comercial)", () => {
    const identity = resolveModelLandingIdentity(
      {
        city: { name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" },
        brand: { name: "Volkswagen", slug: "volkswagen" },
        model: { name: "T-Cross", slug: "t-cross" },
      },
      { slug: "braganca-paulista-sp", brand: "volkswagen", model: "t-cross" }
    );
    expect(buildModelLandingCopy(identity).h1).toBe("Volkswagen T-Cross em Bragança Paulista - SP");
  });

  it("backend fora: cai nos slugs da rota, sem cidade/marca inventada", () => {
    const identity = resolveModelLandingIdentity(
      { city: undefined, brand: null, model: null },
      { slug: "braganca-paulista-sp", brand: "hyundai", model: "hb20" }
    );
    expect(identity).toMatchObject({
      citySlug: "braganca-paulista-sp",
      cityName: "Braganca Paulista",
      cityState: "SP",
      brandName: "Hyundai",
      modelName: "Hb20",
    });
  });

  it.each([
    [ATIBAIA_ONIX, "Chevrolet Onix em Atibaia - SP", "Comprar Chevrolet Onix em Atibaia - SP"],
    [
      BRAGANCA_HB20,
      "Hyundai HB20 em Bragança Paulista - SP",
      "Comprar Hyundai HB20 em Bragança Paulista - SP",
    ],
  ])("H1 e title dinâmicos (%#)", (identity, h1, title) => {
    const copy = buildModelLandingCopy(identity);
    expect(copy.h1).toBe(h1);
    expect(copy.fallbackTitle).toBe(title);
    expect(copy.eyebrow).toBe(`Carros na Cidade · ${identity.cityName} (SP)`);
    expect(copy.lead).toContain(
      `${identity.brandName} ${identity.modelName} usados e seminovos à venda em ${identity.cityName}.`
    );
  });

  it("caminho canônico no mesmo formato do backend e do sitemap", () => {
    expect(modelLandingPath(BRAGANCA_HB20)).toBe(
      "/cidade/braganca-paulista-sp/marca/hyundai/modelo/hb20"
    );
  });
});

describe("summarizeModelListing — números só do estoque devolvido", () => {
  const onix = [
    ad({ price: 77900, year: 2025, below_fipe: true }),
    ad({ price: 74900, year: 2025 }),
    ad({ price: 78900, year: 2023 }),
    ad({ price: 70900, year: 2025, below_fipe: true }),
  ];

  it("conjunto completo → faixas exatas", () => {
    expect(summarizeModelListing(response(onix))).toEqual({
      total: 4,
      belowFipe: 2,
      minPrice: 70900,
      maxPrice: 78900,
      minYear: 2023,
      maxYear: 2025,
    });
  });

  it("página parcial → sem faixa de preço/ano (seria verdade sobre a coisa errada)", () => {
    const partial = response(onix.slice(0, 2), {
      pagination: { page: 1, limit: 2, total: 6, totalPages: 3 },
      engine_offer_counts: { opportunity: 0, below_fipe: 2, highlight: 0 },
    });
    expect(summarizeModelListing(partial)).toEqual({
      total: 6,
      belowFipe: 2,
      minPrice: null,
      maxPrice: null,
      minYear: null,
      maxYear: null,
    });
  });

  it("página parcial no caminho legado (sem contagem do motor) → abaixo da FIPE desconhecido", () => {
    const partial = response(onix.slice(0, 2), {
      pagination: { page: 1, limit: 2, total: 6, totalPages: 3 },
    });
    expect(summarizeModelListing(partial)?.belowFipe).toBeNull();
  });

  it("página 2 nunca é tratada como conjunto completo", () => {
    const page2 = response(onix.slice(0, 1), {
      pagination: { page: 2, limit: 1, total: 1, totalPages: 1 },
    });
    expect(summarizeModelListing(page2)?.minPrice).toBeNull();
  });

  it("sem anúncio → null (a página não exibe indicador nenhum)", () => {
    expect(summarizeModelListing(response([]))).toBeNull();
    expect(summarizeModelListing(undefined)).toBeNull();
  });

  it("preço/ano ausentes não viram 0 nem NaN", () => {
    const summary = summarizeModelListing(
      response([ad({ price: 0, year: undefined }), ad({ price: 50000, year: 2019 })])
    );
    expect(summary).toMatchObject({
      minPrice: 50000,
      maxPrice: 50000,
      minYear: 2019,
      maxYear: 2019,
    });
  });
});

describe("formatação dos indicadores", () => {
  it("faixa de preço e preço único", () => {
    expect(formatPriceRange(63900, 78900)).toBe(brl("R$ 63.900 – R$ 78.900"));
    expect(formatPriceRange(72500, 72500)).toBe(brl("R$ 72.500"));
    expect(formatPriceRange(null, null)).toBeNull();
  });

  it("anos", () => {
    expect(formatYearRange(2021, 2025)).toBe("2021 a 2025");
    expect(formatYearRange(2024, 2024)).toBe("2024");
    expect(formatYearRange(null, null)).toBeNull();
  });

  it("frase do bloco de estoque só com o que o resumo sustenta", () => {
    expect(
      buildInventorySentence({
        total: 6,
        belowFipe: 2,
        minPrice: 63900,
        maxPrice: 78900,
        minYear: 2021,
        maxYear: 2025,
      })
    ).toBe(
      brl(
        "6 veículos anunciados, sendo 2 abaixo da FIPE. Preços entre R$ 63.900 e R$ 78.900, com anos de 2021 a 2025."
      )
    );
    expect(
      buildInventorySentence({
        total: 1,
        belowFipe: 0,
        minPrice: 45900,
        maxPrice: 45900,
        minYear: 2015,
        maxYear: 2015,
      })
    ).toBe(brl("1 veículo anunciado. Preço de R$ 45.900, com ano 2015."));
    expect(
      buildInventorySentence({
        total: 60,
        belowFipe: null,
        minPrice: null,
        maxPrice: null,
        minYear: null,
        maxYear: null,
      })
    ).toBe("60 veículos anunciados.");
  });
});

describe("hasRegionalResults — só representa a decisão do motor", () => {
  it("motor com cidade vizinha com candidato → regional", () => {
    const results = response([ad({ distance_km: 0 })], {
      search_policy: {
        origin_city: { slug: "braganca-paulista-sp", name: "Bragança Paulista" },
        cities: [
          { slug: "braganca-paulista-sp", name: "Bragança Paulista", count: 1, distance_km: 0 },
          { slug: "atibaia-sp", name: "Atibaia", count: 3, distance_km: 18.34 },
        ],
      },
    });
    expect(hasRegionalResults(results)).toBe(true);
  });

  it("todas as candidatas na própria cidade → não regional", () => {
    const results = response([ad({ distance_km: 0 })], {
      search_policy: {
        origin_city: { slug: "atibaia-sp", name: "Atibaia" },
        cities: [
          { slug: "atibaia-sp", name: "Atibaia", count: 6, distance_km: 0 },
          { slug: "braganca-paulista-sp", name: "Bragança Paulista", count: 0, distance_km: 18.34 },
        ],
      },
    });
    expect(hasRegionalResults(results)).toBe(false);
  });

  it("caminho legado (sem search_policy): pela distância dos anúncios", () => {
    expect(hasRegionalResults(response([ad({ distance_km: null })]))).toBe(false);
    expect(hasRegionalResults(response([ad({ distance_km: 18.34 })]))).toBe(true);
  });
});

describe("filtros e URL — cidade, marca e modelo pertencem à rota", () => {
  it("query antiga com território/marca/modelo não filtra nem é reemitida", () => {
    const filters = parseModelLandingFilters({
      city_slug: "sao-paulo-sp",
      brand: "Fiat",
      model: "Uno",
      max_price: "80000",
      sort: "price_asc",
    });
    expect(filters).not.toHaveProperty("city_slug");
    expect(filters).not.toHaveProperty("brand");
    expect(filters).not.toHaveProperty("model");
    expect(filters).toMatchObject({ max_price: 80000, sort: "price_asc", page: 1, limit: 50 });
  });

  it("sem ordenação na URL → relevância (default da vitrine)", () => {
    expect(parseModelLandingFilters({}).sort).toBe("relevance");
  });

  it("pedido ao motor: origem = cidade da rota, produto = o do backend", () => {
    const request = buildModelListingRequest(
      parseModelLandingFilters({ sort: "year_desc", raio: "0" }),
      "braganca-paulista-sp",
      { brand: "Hyundai", commercial_model: "HB20" }
    );
    expect(request).toMatchObject({
      city_slug: "braganca-paulista-sp",
      brand: "Hyundai",
      commercial_model: "HB20",
      sort: "year_desc",
      raio: 0,
    });
    expect(request).not.toHaveProperty("model");
    // Nenhuma regra territorial na página: sem lista de cidades, sem raio inventado.
    expect(request).not.toHaveProperty("city_slugs");
  });

  it("URL FIPE antiga: filtro legado `model` (o motor recusa e cai no legado)", () => {
    const request = buildModelListingRequest(parseModelLandingFilters({}), "atibaia-sp", {
      brand: "Chevrolet",
      model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
    });
    expect(request.model).toBe("ONIX HATCH LT 1.0 12V Flex 5p Mec.");
    expect(request).not.toHaveProperty("commercial_model");
  });

  it("href limpo: sem território, marca, modelo, limit, page=1 nem sort=relevance", () => {
    const filters = {
      ...parseModelLandingFilters({}),
      city_slug: "atibaia-sp",
      brand: "Chevrolet",
      commercial_model: "Onix",
    };
    expect(buildModelLandingHref("/cidade/atibaia-sp/marca/chevrolet/modelo/onix", filters)).toBe(
      "/cidade/atibaia-sp/marca/chevrolet/modelo/onix"
    );
  });

  it("filtros do visitante e paginação entram na query, na forma normalizada", () => {
    const filters = parseModelLandingFilters({ max_price: "80000", sort: "price_asc" });
    expect(buildModelLandingQuery(filters, 2)).toBe("max_price=80000&sort=price_asc&page=2");
    expect(buildModelLandingQuery(filters, 1)).toBe("max_price=80000&sort=price_asc");
  });

  it("raio=0 (apenas a cidade) sobrevive — 0 não é 'ausente'", () => {
    expect(buildModelLandingQuery(parseModelLandingFilters({ raio: "0" }))).toBe("raio=0");
  });

  it("conta só recortes do visitante (ordenação e página não contam)", () => {
    expect(countActiveUserFilters(parseModelLandingFilters({ sort: "price_asc", page: "2" }))).toBe(
      0
    );
    expect(
      countActiveUserFilters(parseModelLandingFilters({ max_price: "80000", raio: "0" }))
    ).toBe(2);
  });
});

describe("navegação rastreável", () => {
  it("breadcrumb: Home › Carros em {cidade} › {Marca} › {Modelo}", () => {
    expect(buildModelLandingBreadcrumbs(BRAGANCA_HB20)).toEqual([
      { label: "Home", href: "/" },
      { label: "Carros em Bragança Paulista", href: "/carros-em/braganca-paulista-sp" },
      { label: "Hyundai", href: "/cidade/braganca-paulista-sp/marca/hyundai" },
      { label: "HB20", href: "/cidade/braganca-paulista-sp/marca/hyundai/modelo/hb20" },
    ]);
  });

  it("Explorar em {cidade}: os mesmos destinos que a página já linkava", () => {
    expect(buildModelLandingExploreLinks(ATIBAIA_ONIX)).toEqual([
      { label: "Todos os carros em Atibaia", href: "/cidade/atibaia-sp" },
      { label: "Carros abaixo da FIPE", href: "/cidade/atibaia-sp/abaixo-da-fipe" },
      { label: "Chevrolet em Atibaia", href: "/cidade/atibaia-sp/marca/chevrolet" },
      { label: "Catálogo completo em Atibaia", href: "/carros-em/atibaia-sp" },
    ]);
  });

  it("marcas populares: só as que qualificam viram link; grafias FIPE se somam", () => {
    const links = buildPopularBrandLinks(
      [
        { brand: "Fiat", total: 7 },
        { brand: "VW - VolksWagen", total: 5 },
        { brand: "Volkswagen", total: 2 },
        { brand: "GM - Chevrolet", total: 6 },
        { brand: "Jeep", total: 2 },
      ],
      "atibaia-sp",
      3
    );
    expect(links).toEqual([
      { brand: "Fiat", total: 7, href: "/cidade/atibaia-sp/marca/fiat" },
      { brand: "Volkswagen", total: 7, href: "/cidade/atibaia-sp/marca/volkswagen" },
      { brand: "Chevrolet", total: 6, href: "/cidade/atibaia-sp/marca/chevrolet" },
    ]);
  });
});
