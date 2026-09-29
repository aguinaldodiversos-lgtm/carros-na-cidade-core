/**
 * Landing cidade + marca + modelo pelo caminho REAL do service
 * (`getCityModelPage`): robots, canonical, title e filtro de produto.
 *
 * Só as bordas de I/O são falsas (resolução por banco, busca, facetas,
 * contagem territorial do motor). O modo servido (`resolveSearchServingMode`),
 * a política de limiares e a regra DEC-30 são as reais — é o que prova que a
 * taxonomia escolhe o limiar certo sem nenhum número no consumidor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveCityModelMock = vi.fn();
const searchMock = vi.fn();
const countTerritoryMock = vi.fn();

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("../../src/shared/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/read-models/cities/territorial-resolve.service.js", () => ({
  resolveCityModel: (...args) => resolveCityModelMock(...args),
}));

vi.mock("../../src/modules/ads/ads.service.js", () => ({
  search: (...args) => searchMock(...args),
}));

vi.mock("../../src/modules/ads/filters/ads-filter.service.js", () => ({
  getFacetsWithFilters: async () => ({ facets: { models: [] } }),
}));

// Dicionário nacional de modelos comerciais ativos: é dele que sai o rótulo
// quando a cidade não tem o modelo (taxonomia "none").
vi.mock("../../src/modules/ads/search-policy/dictionaries.js", () => ({
  getCommercialModelDictionary: async () => [{ label: "Renegade", brand: "Jeep" }],
}));

vi.mock("../../src/modules/ads/search-policy/engine.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    countSearchPolicyTerritory: (...args) => countTerritoryMock(...args),
  };
});

const { getCityModelPage } = await import("../../src/read-models/cities/city-model.service.js");

const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp", stage: "active" };

function resolution({ brandLabel, brandSlug, modelLabel, modelSlug, activeCount, taxonomy }) {
  return {
    city: ATIBAIA,
    brandSlug,
    brand: { label: brandLabel, values: [brandLabel] },
    modelSlug,
    model: {
      label: modelLabel,
      activeCount,
      hasActiveInventory: activeCount > 0,
      stats: {
        total: activeCount,
        highlight: 0,
        belowFipe: 0,
        minPrice: null,
        maxPrice: null,
        avgPrice: null,
        minYear: null,
        maxYear: null,
      },
    },
    taxonomy,
  };
}

const RENEGADE = (activeCount = 1) =>
  resolution({
    brandLabel: "Jeep",
    brandSlug: "jeep",
    modelLabel: "Renegade",
    modelSlug: "renegade",
    activeCount,
    taxonomy: "commercial",
  });

function territory(local, total) {
  countTerritoryMock.mockResolvedValue({
    origin_city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
    geo_mode: "AUTO_RADIUS",
    local_result_count: local,
    total_result_count: total,
  });
}

const savedEnv = {
  SEARCH_POLICY_ENGINE: process.env.SEARCH_POLICY_ENGINE,
  SEARCH_POLICY_ENGINE_CITIES: process.env.SEARCH_POLICY_ENGINE_CITIES,
};

beforeEach(() => {
  resolveCityModelMock.mockReset();
  countTerritoryMock.mockReset();
  searchMock.mockReset();
  // A busca do cluster devolve ruído de propósito: Compass e Onix não podem
  // aparecer numa landing de Renegade.
  searchMock.mockResolvedValue({
    data: [
      { id: 1, brand: "Jeep", model: "RENEGADE Longitude 1.8 4x2 Flex 16V Aut." },
      { id: 2, brand: "Jeep", model: "COMPASS LONGITUDE 2.0 4x2 Flex 16V Aut." },
      { id: 3, brand: "GM - Chevrolet", model: "ONIX HATCH LT 1.0 12V Flex 5p Mec." },
    ],
    filters: {},
    pagination: { total: 3 },
  });
  process.env.SEARCH_POLICY_ENGINE = "v1";
  process.env.SEARCH_POLICY_ENGINE_CITIES = "*";
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("Jeep Renegade em Atibaia — 1 anúncio local", () => {
  it("motor servindo, 1 local e nenhum regional extra → index,follow, canonical self", async () => {
    resolveCityModelMock.mockResolvedValue(RENEGADE(1));
    territory(1, 1);

    const page = await getCityModelPage("atibaia-sp", "jeep", "renegade");

    expect(page.seo).toMatchObject({
      robots: "index,follow",
      indexable: true,
      canonicalPath: "/cidade/atibaia-sp/marca/jeep/modelo/renegade",
      title: "Comprar Jeep Renegade em Atibaia - SP | Carros na Cidade",
      indexability: {
        rule: "DEC-30",
        servingMode: "search_policy",
        localModelCount: 1,
        regionalModelCount: 1,
        minInventory: 1,
      },
    });
  });

  it("1 local + Renegades regionais → index; o motor conta SÓ o modelo pedido", async () => {
    resolveCityModelMock.mockResolvedValue(RENEGADE(1));
    territory(1, 5);

    const page = await getCityModelPage("atibaia-sp", "jeep", "renegade");

    expect(page.seo.robots).toBe("index,follow");
    expect(page.listingFilters).toEqual({ brand: "Jeep", commercial_model: "Renegade" });
    expect(countTerritoryMock).toHaveBeenCalledWith(
      { city_slug: "atibaia-sp", brand: "Jeep", commercial_model: "Renegade" },
      expect.anything()
    );
  });

  it("a listagem não vira catálogo geral: nada de Compass ou Onix", async () => {
    resolveCityModelMock.mockResolvedValue(RENEGADE(1));
    territory(1, 1);

    const page = await getCityModelPage("atibaia-sp", "jeep", "renegade");

    expect(page.sections.ads.map((ad) => ad.id)).toEqual([1]);
  });

  it("legado servindo (fora da allowlist), 1 local → index,follow", async () => {
    process.env.SEARCH_POLICY_ENGINE_CITIES = "braganca-paulista-sp";
    resolveCityModelMock.mockResolvedValue(RENEGADE(1));

    const page = await getCityModelPage("atibaia-sp", "jeep", "renegade");

    expect(page.seo).toMatchObject({
      robots: "index,follow",
      canonicalPath: "/cidade/atibaia-sp/marca/jeep/modelo/renegade",
      indexability: { servingMode: "legacy", minInventory: 1 },
    });
    expect(countTerritoryMock).not.toHaveBeenCalled();
  });

  it("Jeep Compass com 1 local segue a mesma regra (nada é específico do Renegade)", async () => {
    resolveCityModelMock.mockResolvedValue(
      resolution({
        brandLabel: "Jeep",
        brandSlug: "jeep",
        modelLabel: "Compass",
        modelSlug: "compass",
        activeCount: 1,
        taxonomy: "commercial",
      })
    );
    territory(1, 1);

    const page = await getCityModelPage("atibaia-sp", "jeep", "compass");

    expect(page.seo.robots).toBe("index,follow");
    expect(page.seo.canonicalPath).toBe("/cidade/atibaia-sp/marca/jeep/modelo/compass");
  });
});

describe("sem âncora local", () => {
  it("0 em Atibaia, Renegades só nas vizinhas → noindex no_local_anchor", async () => {
    resolveCityModelMock.mockResolvedValue({
      ...RENEGADE(0),
      taxonomy: "none",
    });
    territory(0, 4);

    const page = await getCityModelPage("atibaia-sp", "jeep", "renegade");

    expect(page.seo).toMatchObject({
      robots: "noindex,follow",
      noindexReason: "no_local_anchor",
      canonicalPath: "/cidade/atibaia-sp/marca/jeep/modelo/renegade",
      indexability: { servingMode: "search_policy", localModelCount: 0, regionalModelCount: 4 },
    });
    // A listagem continua pedindo Renegade ao motor (regionais aparecem).
    expect(page.listingFilters).toEqual({ brand: "Jeep", commercial_model: "Renegade" });
  });
});

describe("URL antiga por descrição FIPE — comportamento preservado", () => {
  const FIPE_SLUG = "onix-hatch-lt-1-0-12v-flex-5p-mec";
  const fipe = (activeCount) =>
    resolution({
      brandLabel: "GM - Chevrolet",
      brandSlug: "chevrolet",
      modelLabel: "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
      modelSlug: FIPE_SLUG,
      activeCount,
      taxonomy: "fipe",
    });

  it.each([
    [1, "noindex,follow"],
    [2, "noindex,follow"],
    [3, "index,follow"],
  ])("local=%i → %s, canonical continua a própria URL", async (count, robots) => {
    resolveCityModelMock.mockResolvedValue(fipe(count));

    const page = await getCityModelPage("atibaia-sp", "chevrolet", FIPE_SLUG);

    expect(page.seo).toMatchObject({
      robots,
      canonicalPath: `/cidade/atibaia-sp/marca/chevrolet/modelo/${FIPE_SLUG}`,
      indexability: { servingMode: "legacy", minInventory: 3 },
    });
    // Filtro legado `model` → o motor nem é consultado.
    expect(page.listingFilters).toEqual({
      brand: "Chevrolet",
      model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
    });
    expect(countTerritoryMock).not.toHaveBeenCalled();
  });
});
