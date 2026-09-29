/**
 * Sitemap de modelos × política de MODEL, ponta a ponta.
 *
 * Só o repositório (linhas de estoque ativo por cidade) e a contagem
 * territorial do motor são falsos. A geração de candidatos, a elegibilidade
 * DEC-30, o modo servido e os limiares são os reais — é o mesmo caminho que
 * decide o robots da landing, então sitemap e robots não têm como divergir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repoMock = vi.hoisted(() => ({
  listActiveCityRows: vi.fn(),
  listActiveCityBelowFipeRows: vi.fn(),
  listActiveCityBrandRows: vi.fn(),
  listActiveCityBrandModelRows: vi.fn(),
}));
vi.mock("../../src/read-models/seo/territorial-inventory-sitemap.repository.js", () => repoMock);
vi.mock("../../src/shared/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { listActiveCityBrandModelEntries } = await import(
  "../../src/read-models/seo/territorial-inventory-sitemap.service.js"
);
const { resolveCityModelSeoEligibility } = await import(
  "../../src/read-models/cities/city-model-seo-eligibility.js"
);
const { matchModelRowsBySlug, aggregateMatchedRows } = await import(
  "../../src/read-models/cities/territorial-cluster.logic.js"
);

/**
 * Estoque ativo por cidade. Atibaia: 1 Renegade, 1 Compass, 6 Onix em quatro
 * versões FIPE. Bragança: 3 Tracker — nenhum em Atibaia.
 */
const STOCK = {
  "atibaia-sp": [
    { brand: "Jeep", model: "RENEGADE Longitude 1.8 4x2 Flex 16V Aut.", total: 1 },
    { brand: "Jeep", model: "COMPASS LONGITUDE 2.0 4x2 Flex 16V Aut.", total: 1 },
    { brand: "GM - Chevrolet", model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.", total: 2 },
    { brand: "GM - Chevrolet", model: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.", total: 2 },
    { brand: "GM - Chevrolet", model: "ONIX HATCH 1.0 12V Flex 5p Mec.", total: 1 },
    { brand: "GM - Chevrolet", model: "ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.", total: 1 },
  ],
  "braganca-paulista-sp": [
    { brand: "GM - Chevrolet", model: "TRACKER Premier 1.2 Turbo Flex Aut.", total: 3 },
  ],
};

const sitemapRows = () =>
  Object.entries(STOCK).flatMap(([city_slug, rows]) =>
    rows.map((r) => ({ city_slug, state: "SP", last_updated: "2026-09-01T00:00:00.000Z", ...r }))
  );

/** Resolução como `resolveCityModel` faria, sobre o estoque próprio da cidade. */
function fakeResolveCityModel(citySlug, brandSlug, modelSlug) {
  const rows = STOCK[citySlug];
  if (!rows) return { city: null };
  const matched = matchModelRowsBySlug(rows, modelSlug);
  const model = aggregateMatchedRows(matched.rows, {
    labelKey: "model",
    slug: modelSlug,
    labelOverride: matched.commercialLabel,
  });
  return {
    city: { slug: citySlug },
    brandSlug,
    brand: { label: matched.rows[0]?.brand || brandSlug },
    modelSlug,
    model,
    taxonomy: matched.taxonomy,
  };
}

/** Motor: território = próprio da cidade + vizinhas (Atibaia ↔ Bragança). */
const countTerritory = vi.fn(async (query) => {
  const own = (city) =>
    (STOCK[city] || [])
      .filter((r) => r.model.toLowerCase().includes(String(query.commercial_model).toLowerCase()))
      .reduce((sum, r) => sum + r.total, 0);
  const local = own(query.city_slug);
  return {
    origin_city: { slug: query.city_slug },
    geo_mode: "AUTO_RADIUS",
    local_result_count: local,
    total_result_count:
      local + own(query.city_slug === "atibaia-sp" ? "braganca-paulista-sp" : "atibaia-sp"),
  };
});

const evaluate = (city, brand, model) =>
  resolveCityModelSeoEligibility(city, brand, model, {
    resolveCityModel: async (...args) => fakeResolveCityModel(...args),
    resolveListing: async (resolution) => ({
      filters:
        resolution.taxonomy === "fipe"
          ? { brand: resolution.brand.label, model: resolution.model.label }
          : { brand: resolution.brand.label, commercial_model: resolution.model.label },
    }),
    countTerritory,
  });

const saved = {
  SEARCH_POLICY_ENGINE: process.env.SEARCH_POLICY_ENGINE,
  SEARCH_POLICY_ENGINE_CITIES: process.env.SEARCH_POLICY_ENGINE_CITIES,
};

beforeEach(() => {
  countTerritory.mockClear();
  repoMock.listActiveCityBrandModelRows.mockResolvedValue(sitemapRows());
  process.env.SEARCH_POLICY_ENGINE = "v1";
  process.env.SEARCH_POLICY_ENGINE_CITIES = "*";
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("sitemap de modelos — modelo comercial com âncora de 1", () => {
  it.each([
    ["motor", "v1", "*"],
    ["legado", "off", "*"],
  ])("L: Renegade e Compass com 1 anúncio local entram (%s)", async (_label, flag, cities) => {
    process.env.SEARCH_POLICY_ENGINE = flag;
    process.env.SEARCH_POLICY_ENGINE_CITIES = cities;
    const locs = (await listActiveCityBrandModelEntries(50000, { evaluate })).map((e) => e.loc);

    expect(locs).toEqual(
      expect.arrayContaining([
        "/cidade/atibaia-sp/marca/jeep/modelo/renegade",
        "/cidade/atibaia-sp/marca/jeep/modelo/compass",
        "/cidade/atibaia-sp/marca/chevrolet/modelo/onix",
        "/cidade/braganca-paulista-sp/marca/chevrolet/modelo/tracker",
      ])
    );
  });

  it("M: sem estoque local o modelo não vira URL da cidade — Tracker só existe em Bragança", async () => {
    const locs = (await listActiveCityBrandModelEntries(50000, { evaluate })).map((e) => e.loc);
    expect(locs).not.toContain("/cidade/atibaia-sp/marca/chevrolet/modelo/tracker");
    expect(locs.filter((l) => l.includes("/modelo/tracker"))).toEqual([
      "/cidade/braganca-paulista-sp/marca/chevrolet/modelo/tracker",
    ]);
  });

  it("M: mesmo avaliada, a URL sem âncora local é negada (no_local_anchor)", async () => {
    const verdict = await evaluate("atibaia-sp", "chevrolet", "tracker");
    // Atibaia não tem Tracker: taxonomia "none" e o rótulo não sai do estoque
    // próprio — aqui forçamos o filtro comercial para provar a regra do motor.
    const withFilter = await resolveCityModelSeoEligibility("atibaia-sp", "chevrolet", "tracker", {
      resolveCityModel: async (...args) => fakeResolveCityModel(...args),
      resolveListing: async () => ({
        filters: { brand: "Chevrolet", commercial_model: "Tracker" },
      }),
      countTerritory,
    });
    expect(verdict.indexable).toBe(false);
    expect(withFilter).toMatchObject({
      indexable: false,
      noindexReason: "no_local_anchor",
      local_model_count: 0,
      regional_model_count: 3,
    });
  });

  it("F: nenhuma URL por descrição FIPE é gerada — só entidades comerciais", async () => {
    const locs = (await listActiveCityBrandModelEntries(50000, { evaluate })).map((e) => e.loc);
    for (const loc of locs) expect(loc).not.toMatch(/12v|flex|mec|hatch|sedan|longitude/i);
    expect(locs.filter((l) => l.includes("/modelo/onix"))).toEqual([
      "/cidade/atibaia-sp/marca/chevrolet/modelo/onix",
    ]);
  });

  it("F: a URL FIPE antiga, se avaliada, continua noindex com 1-2 anúncios", async () => {
    const verdict = await evaluate("atibaia-sp", "chevrolet", "onix-hatch-lt-1-0-12v-flex-5p-mec");
    expect(verdict).toMatchObject({
      indexable: false,
      serving_mode: "legacy",
      local_model_count: 2,
      min_inventory: 3,
    });
  });
});
