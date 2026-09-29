import { afterEach, describe, it, expect, vi } from "vitest";

import {
  CITY_MODEL_SEO_REASON,
  SERVING_MODE,
  decideCityModelSeoEligibility,
  evaluateCityModelSeoEligibility,
  resolveCityModelSeoEligibility,
} from "./city-model-seo-eligibility.js";
import { resolveSearchServingMode } from "../../modules/ads/search-policy/engine.js";
import { buildClusterSeo } from "./territorial-cluster.logic.js";
import { filterEligibleModelEntries } from "../seo/territorial-inventory-sitemap.service.js";
import { SEO_SURFACE, getSeoThreshold, seoSurfaceForModelTaxonomy } from "./city-thresholds.js";

const HB20 = { brand: "Hyundai", commercial_model: "HB20" };
const ENGINE = () => ({ mode: SERVING_MODE.ENGINE, reason: null });
const LEGACY = () => ({ mode: SERVING_MODE.LEGACY, reason: "origin_not_allowed" });

/** Contador falso no formato de `countSearchPolicyTerritory`. */
function territory({ local, total, origin = "braganca-paulista-sp", geoMode = "AUTO_RADIUS" }) {
  return vi.fn(async () => ({
    origin_city: origin ? { slug: origin, name: "X", state: "SP" } : null,
    geo_mode: geoMode,
    reason: "REGIONAL_FLOOR",
    local_result_count: local,
    total_result_count: total,
  }));
}

/**
 * Avalia pelo caminho da landing. `own` é o estoque próprio agregado pela
 * cidade (o que o legado lista); `local`/`total` são o que o motor contaria.
 */
async function evaluate({ own, local, total, serving = ENGINE, ...rest }, overrides = {}) {
  const countTerritory = territory({ local, total, ...rest });
  const out = await evaluateCityModelSeoEligibility(
    {
      citySlug: "braganca-paulista-sp",
      listingFilters: HB20,
      ownActiveCount: own ?? local ?? 0,
      minInventory: 3,
      ...overrides,
    },
    { countTerritory, resolveServingMode: serving }
  );
  return { out, countTerritory };
}

const savedEnv = {
  SEARCH_POLICY_ENGINE: process.env.SEARCH_POLICY_ENGINE,
  SEARCH_POLICY_ENGINE_CITIES: process.env.SEARCH_POLICY_ENGINE_CITIES,
};
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("DEC-30 — regra pura por modo servido", () => {
  it.each([
    [3, 3, true, CITY_MODEL_SEO_REASON.LOCAL_ANCHOR_WITH_REGIONAL_INVENTORY],
    [1, 4, true, CITY_MODEL_SEO_REASON.LOCAL_ANCHOR_WITH_REGIONAL_INVENTORY],
    [1, 2, false, CITY_MODEL_SEO_REASON.BELOW_MIN_INVENTORY],
    [0, 8, false, CITY_MODEL_SEO_REASON.NO_LOCAL_ANCHOR],
    [0, 0, false, CITY_MODEL_SEO_REASON.NO_ACTIVE_INVENTORY],
  ])("motor: local=%i regional=%i → indexable=%s (%s)", (local, regional, indexable, reason) => {
    const out = decideCityModelSeoEligibility({
      servingMode: SERVING_MODE.ENGINE,
      localCount: local,
      regionalCount: regional,
      minInventory: 3,
    });
    expect(out).toMatchObject({ indexable, reason, rule: "DEC-30", serving_mode: "search_policy" });
    expect(out.noindexReason).toBe(indexable ? null : reason);
  });

  it.each([
    [3, true, CITY_MODEL_SEO_REASON.LOCAL_INVENTORY],
    [2, false, CITY_MODEL_SEO_REASON.BELOW_MIN_INVENTORY],
    [1, false, CITY_MODEL_SEO_REASON.BELOW_MIN_INVENTORY],
    [0, false, CITY_MODEL_SEO_REASON.NO_ACTIVE_INVENTORY],
  ])("legado: local=%i → indexable=%s (%s) — regra de DEC-29", (local, indexable, reason) => {
    const out = decideCityModelSeoEligibility({
      servingMode: SERVING_MODE.LEGACY,
      localCount: local,
      regionalCount: 99, // território teórico: ignorado no legado
      minInventory: 3,
    });
    expect(out).toMatchObject({ indexable, reason, serving_mode: "legacy" });
    expect(out.regional_model_count).toBeNull();
  });

  it("o limiar é o recebido da política central, não um número próprio", () => {
    expect(
      decideCityModelSeoEligibility({
        servingMode: SERVING_MODE.ENGINE,
        localCount: 1,
        regionalCount: 4,
        minInventory: 5,
      }).indexable
    ).toBe(false);
  });
});

describe("DEC-30 — matriz obrigatória (pelo caminho da landing)", () => {
  it("motor ON: local=1, regional=4, exibidos regionalmente=4 → INDEX", async () => {
    const { out } = await evaluate({ own: 1, local: 1, total: 4, serving: ENGINE });
    expect(out).toMatchObject({
      indexable: true,
      serving_mode: "search_policy",
      local_model_count: 1,
      regional_model_count: 4,
    });
  });

  it("motor OFF: local=1, regional teórico=4, exibidos localmente=1 → NOINDEX", async () => {
    const { out, countTerritory } = await evaluate({
      own: 1,
      local: 1,
      total: 4,
      serving: LEGACY,
    });
    expect(out).toMatchObject({
      indexable: false,
      serving_mode: "legacy",
      serving_reason: "origin_not_allowed",
      local_model_count: 1,
      noindexReason: CITY_MODEL_SEO_REASON.BELOW_MIN_INVENTORY,
    });
    // Fora da allowlist o território do motor nem é consultado.
    expect(countTerritory).not.toHaveBeenCalled();
  });

  it("motor OFF: local=3, exibidos=3 → INDEX", async () => {
    const { out } = await evaluate({ own: 3, local: 3, total: 4, serving: LEGACY });
    expect(out).toMatchObject({ indexable: true, serving_mode: "legacy", local_model_count: 3 });
  });

  it("motor ON: local=0, regional=6 → NOINDEX (sem âncora local)", async () => {
    const { out } = await evaluate({ own: 0, local: 0, total: 6, serving: ENGINE });
    expect(out.indexable).toBe(false);
    expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.NO_LOCAL_ANCHOR);
  });

  it("motor ON: território vazio → NOINDEX", async () => {
    const { out } = await evaluate({ local: 0, total: 0, serving: ENGINE });
    expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.NO_ACTIVE_INVENTORY);
  });

  it("motor ON: os números vêm do motor, não do estoque agregado pela cidade", async () => {
    const { out } = await evaluate({ own: 3, local: 1, total: 1, serving: ENGINE });
    expect(out.indexable).toBe(false);
    expect(out.regional_model_count).toBe(1);
  });

  it("motor ON: pede ao motor a mesma origem e o mesmo filtro de produto da listagem", async () => {
    const { countTerritory } = await evaluate({ local: 1, total: 4 });
    expect(countTerritory).toHaveBeenCalledWith(
      { city_slug: "braganca-paulista-sp", brand: "Hyundai", commercial_model: "HB20" },
      expect.anything()
    );
  });
});

/**
 * Mesma avaliação, mas SEM `minInventory` injetado: o limiar vem da política
 * central pela taxonomia resolvida — é o caminho que a página e o sitemap
 * usam em produção.
 */
async function byPolicy({ taxonomy, own, local, total, serving, listingFilters = HB20 }) {
  const countTerritory = territory({ local, total });
  const out = await evaluateCityModelSeoEligibility(
    { citySlug: "braganca-paulista-sp", listingFilters, ownActiveCount: own, taxonomy },
    { countTerritory, resolveServingMode: serving }
  );
  return { out, countTerritory };
}

const FIPE_FILTERS = { brand: "Chevrolet", model: "ONIX HATCH LT 1.0 12V Flex 5p Mec." };

describe("política de MODEL — comercial = 1 (âncora local), URL FIPE legada = base", () => {
  it("limiares resolvidos pela taxonomia", () => {
    expect(getSeoThreshold(seoSurfaceForModelTaxonomy("commercial"))).toBe(1);
    expect(getSeoThreshold(seoSurfaceForModelTaxonomy("none"))).toBe(1);
    expect(getSeoThreshold(seoSurfaceForModelTaxonomy("fipe"))).toBe(3);
    // Ausente/desconhecida → a mais estrita.
    expect(seoSurfaceForModelTaxonomy(undefined)).toBe(SEO_SURFACE.MODEL_FIPE_LEGACY);
    expect(seoSurfaceForModelTaxonomy("outra")).toBe(SEO_SURFACE.MODEL_FIPE_LEGACY);
  });

  // A — motor, 1 local, nenhum regional adicional.
  it("A: comercial, motor, local=1 regional=1 → INDEX", async () => {
    const { out } = await byPolicy({
      taxonomy: "commercial",
      own: 1,
      local: 1,
      total: 1,
      serving: ENGINE,
    });
    expect(out).toMatchObject({
      indexable: true,
      serving_mode: "search_policy",
      reason: CITY_MODEL_SEO_REASON.LOCAL_ANCHOR_WITH_REGIONAL_INVENTORY,
      local_model_count: 1,
      regional_model_count: 1,
      min_inventory: 1,
    });
  });

  // B — motor, 1 local + regionais.
  it("B: comercial, motor, local=1 regional=4 → INDEX", async () => {
    const { out } = await byPolicy({
      taxonomy: "commercial",
      own: 1,
      local: 1,
      total: 4,
      serving: ENGINE,
    });
    expect(out).toMatchObject({ indexable: true, local_model_count: 1, regional_model_count: 4 });
  });

  // C — motor, estoque só nas vizinhas.
  it("C: comercial, motor, local=0 regional=4 → NOINDEX no_local_anchor", async () => {
    const { out } = await byPolicy({
      taxonomy: "commercial",
      own: 0,
      local: 0,
      total: 4,
      serving: ENGINE,
    });
    expect(out.indexable).toBe(false);
    expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.NO_LOCAL_ANCHOR);
  });

  it("comercial, motor, local=0 regional=0 → NOINDEX", async () => {
    const { out } = await byPolicy({
      taxonomy: "commercial",
      own: 0,
      local: 0,
      total: 0,
      serving: ENGINE,
    });
    expect(out.indexable).toBe(false);
    expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.NO_ACTIVE_INVENTORY);
  });

  // D / E — legado (cidade fora da allowlist) com filtro comercial.
  it("D: comercial, legado, local=1 → INDEX (sem consultar o motor)", async () => {
    const { out, countTerritory } = await byPolicy({
      taxonomy: "commercial",
      own: 1,
      local: 1,
      total: 4,
      serving: LEGACY,
    });
    expect(out).toMatchObject({
      indexable: true,
      serving_mode: "legacy",
      reason: CITY_MODEL_SEO_REASON.LOCAL_INVENTORY,
      local_model_count: 1,
      min_inventory: 1,
    });
    expect(countTerritory).not.toHaveBeenCalled();
  });

  it("E: comercial, legado, local=0 → NOINDEX", async () => {
    const { out } = await byPolicy({
      taxonomy: "commercial",
      own: 0,
      local: 0,
      total: 4,
      serving: LEGACY,
    });
    expect(out.indexable).toBe(false);
    expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.NO_ACTIVE_INVENTORY);
  });

  // URL antiga por descrição FIPE: sempre legado (`model` fora do contrato),
  // limiar base. Nada muda para ela.
  it.each([
    [1, false],
    [2, false],
    [3, true],
    [5, true],
  ])(
    "URL FIPE legada, local=%i → indexable=%s (limiar base preservado)",
    async (own, indexable) => {
      process.env.SEARCH_POLICY_ENGINE = "v1";
      process.env.SEARCH_POLICY_ENGINE_CITIES = "*";
      const countTerritory = vi.fn();
      const out = await evaluateCityModelSeoEligibility(
        {
          citySlug: "atibaia-sp",
          listingFilters: FIPE_FILTERS,
          ownActiveCount: own,
          taxonomy: "fipe",
        },
        { countTerritory }
      );
      expect(out).toMatchObject({
        indexable,
        serving_mode: "legacy",
        serving_reason: "unsupported_params",
        min_inventory: 3,
      });
      if (!indexable) expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.BELOW_MIN_INVENTORY);
      expect(countTerritory).not.toHaveBeenCalled();
    }
  );

  it("taxonomia ausente nunca indexa com o limiar comercial por acidente", async () => {
    const { out } = await byPolicy({ own: 1, local: 1, total: 1, serving: LEGACY });
    expect(out.indexable).toBe(false);
    expect(out.min_inventory).toBe(3);
  });

  it("falha do motor continua fail-closed com o limiar comercial", async () => {
    const out = await evaluateCityModelSeoEligibility(
      { citySlug: "atibaia-sp", listingFilters: HB20, ownActiveCount: 5, taxonomy: "commercial" },
      {
        resolveServingMode: ENGINE,
        countTerritory: vi.fn().mockRejectedValue(new Error("pool exhausted")),
      }
    );
    expect(out).toMatchObject({
      indexable: false,
      noindexReason: CITY_MODEL_SEO_REASON.ELIGIBILITY_UNAVAILABLE,
      min_inventory: 1,
    });
  });
});

describe("modo servido = as portas do controller de /api/ads/search", () => {
  const q = { city_slug: "braganca-paulista-sp", ...HB20 };
  const env = (flag, cities) => ({
    SEARCH_POLICY_ENGINE: flag,
    SEARCH_POLICY_ENGINE_CITIES: cities,
  });

  it.each([
    ["v1", "*", q, "search_policy", null],
    ["v1", "atibaia-sp,braganca-paulista-sp", q, "search_policy", null],
    ["v1", "atibaia-sp", q, "legacy", "origin_not_allowed"],
    ["shadow", "*", q, "legacy", "flag_not_v1"],
    ["off", "*", q, "legacy", "flag_not_v1"],
    ["v1", "*", { ...q, model: "HB20 1.0" }, "legacy", "unsupported_params"],
  ])("flag=%s cidades=%s → %s", (flag, cities, query, mode, reason) => {
    expect(resolveSearchServingMode(query, query.city_slug, env(flag, cities))).toEqual({
      mode,
      reason,
    });
  });
});

describe("trocar SEARCH_POLICY_ENGINE_CITIES muda modo e regra juntos, robots = sitemap", () => {
  // Nada injetado no modo servido: vale o `process.env` do momento, como no
  // controller. `own`/`local`/`total` descrevem a cidade e o território.
  const depsFor = ({ own, local, total, taxonomy = "commercial" }) => ({
    resolveCityModel: async () => ({
      city: { slug: "braganca-paulista-sp" },
      model: { activeCount: own },
      taxonomy,
    }),
    resolveListing: async () => ({ filters: HB20 }),
    countTerritory: territory({ local, total }),
  });
  const LOC = "/cidade/braganca-paulista-sp/marca/hyundai/modelo/hb20";

  async function snapshot(deps) {
    const eligibility = await resolveCityModelSeoEligibility(
      "braganca-paulista-sp",
      "hyundai",
      "hb20",
      deps
    );
    const robots = buildClusterSeo({
      canonicalPath: LOC,
      title: "t",
      description: "d",
      activeCount: 1,
      minInventory: eligibility.min_inventory,
      eligibility,
    }).robots;
    const sitemap = await filterEligibleModelEntries([{ loc: LOC }], (c, b, m) =>
      resolveCityModelSeoEligibility(c, b, m, deps)
    );
    return { mode: eligibility.serving_mode, robots, inSitemap: sitemap.length === 1 };
  }

  const MATRIX = [
    ["v1", "atibaia-sp,braganca-paulista-sp", "search_policy"],
    ["v1", "atibaia-sp", "legacy"],
    ["off", "*", "legacy"],
    ["v1", "*", "search_policy"],
  ];

  it("comercial, 1 próprio + 4 no território: o modo segue a allowlist, a âncora de 1 indexa nos dois", async () => {
    // Com o limiar comercial em 1, motor (local>=1 AND regional>=1) e legado
    // (local>=1) coincidem para quem tem âncora local. Robots e sitemap
    // continuam decidindo JUNTOS em cada modo.
    const deps = depsFor({ own: 1, local: 1, total: 4 });
    for (const [flag, cities, mode] of MATRIX) {
      process.env.SEARCH_POLICY_ENGINE = flag;
      process.env.SEARCH_POLICY_ENGINE_CITIES = cities;
      expect(await snapshot(deps)).toEqual({ mode, robots: "index,follow", inSitemap: true });
    }
  });

  it("comercial, 0 próprio + 4 no território: noindex e fora do sitemap em qualquer modo", async () => {
    const deps = depsFor({ own: 0, local: 0, total: 4 });
    for (const [flag, cities, mode] of MATRIX) {
      process.env.SEARCH_POLICY_ENGINE = flag;
      process.env.SEARCH_POLICY_ENGINE_CITIES = cities;
      expect(await snapshot(deps)).toEqual({ mode, robots: "noindex,follow", inSitemap: false });
    }
  });

  it("URL FIPE legada com 1-2 anúncios: robots noindex = fora do sitemap, mesmo com o motor ligado", async () => {
    // O sitemap nunca GERA essa URL (candidatos são só comerciais); aqui a
    // prova é que, se ela chegasse ao filtro, robots e sitemap diriam o mesmo.
    for (const own of [1, 2]) {
      const deps = {
        ...depsFor({ own, local: own, total: own, taxonomy: "fipe" }),
        resolveListing: async () => ({ filters: FIPE_FILTERS }),
      };
      process.env.SEARCH_POLICY_ENGINE = "v1";
      process.env.SEARCH_POLICY_ENGINE_CITIES = "*";
      expect(await snapshot(deps)).toEqual({
        mode: "legacy",
        robots: "noindex,follow",
        inSitemap: false,
      });
    }
  });
});

describe("DEC-30 — bordas", () => {
  it("modelo sem rótulo em lugar nenhum (filtros null) → noindex, sem consultar o motor", async () => {
    const countTerritory = vi.fn();
    const out = await evaluateCityModelSeoEligibility(
      { citySlug: "atibaia-sp", listingFilters: null, ownActiveCount: 0, minInventory: 3 },
      { countTerritory, resolveServingMode: ENGINE }
    );
    expect(out.indexable).toBe(false);
    expect(countTerritory).not.toHaveBeenCalled();
  });

  it("URL antiga por descrição FIPE (`model`) é servida pelo legado → regra de DEC-29", async () => {
    process.env.SEARCH_POLICY_ENGINE = "v1";
    process.env.SEARCH_POLICY_ENGINE_CITIES = "*";
    const countTerritory = vi.fn();
    const fipe = { brand: "Chevrolet", model: "ONIX HATCH LT 1.0" };
    const three = await evaluateCityModelSeoEligibility(
      { citySlug: "atibaia-sp", listingFilters: fipe, ownActiveCount: 3, minInventory: 3 },
      { countTerritory }
    );
    const two = await evaluateCityModelSeoEligibility(
      { citySlug: "atibaia-sp", listingFilters: fipe, ownActiveCount: 2, minInventory: 3 },
      { countTerritory }
    );
    expect(three).toMatchObject({
      indexable: true,
      serving_mode: "legacy",
      serving_reason: "unsupported_params",
    });
    expect(two.indexable).toBe(false);
    expect(countTerritory).not.toHaveBeenCalled();
  });

  it("GEO_FALLBACK (local nulo, território = a cidade) conta local = total", async () => {
    const { out } = await evaluate({ local: null, total: 3, geoMode: "EXACT_CITY" });
    expect(out).toMatchObject({ indexable: true, local_model_count: 3 });
  });

  it("origem não resolvida pelo motor (contagem nacional) → noindex fail-closed", async () => {
    const { out } = await evaluate({ local: 5, total: 50, origin: null });
    expect(out.indexable).toBe(false);
    expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.ELIGIBILITY_UNAVAILABLE);
  });

  it("erro do motor → noindex fail-closed, sem lançar", async () => {
    const out = await evaluateCityModelSeoEligibility(
      { citySlug: "atibaia-sp", listingFilters: HB20, ownActiveCount: 5, minInventory: 3 },
      {
        resolveServingMode: ENGINE,
        countTerritory: vi.fn().mockRejectedValue(new Error("pool exhausted")),
      }
    );
    expect(out.indexable).toBe(false);
    expect(out.noindexReason).toBe(CITY_MODEL_SEO_REASON.ELIGIBILITY_UNAVAILABLE);
  });

  it("caminho do sitemap: cidade inexistente → null", async () => {
    const out = await resolveCityModelSeoEligibility("nao-existe-sp", "hyundai", "hb20", {
      resolveCityModel: async () => ({ city: null }),
    });
    expect(out).toBeNull();
  });
});

describe("buildClusterSeo com eligibility (landing de modelo)", () => {
  const base = {
    canonicalPath: "/cidade/braganca-paulista-sp/marca/hyundai/modelo/hb20",
    title: "t",
    description: "d",
    activeCount: 1,
    minInventory: 3,
  };

  it("eligibility do motor decide o robots mesmo com estoque próprio abaixo do limiar", async () => {
    const { out: eligibility } = await evaluate({ own: 1, local: 1, total: 4 });
    const seo = buildClusterSeo({ ...base, eligibility });
    expect(seo).toMatchObject({
      robots: "index,follow",
      indexable: true,
      noindexReason: null,
      activeCount: 1,
      canonicalPath: base.canonicalPath,
      indexability: {
        rule: "DEC-30",
        servingMode: "search_policy",
        localModelCount: 1,
        regionalModelCount: 4,
      },
    });
  });

  it("eligibility negativa vira noindex com o motivo", async () => {
    const { out: eligibility } = await evaluate({ own: 3, local: 1, total: 2 });
    const seo = buildClusterSeo({ ...base, activeCount: 3, eligibility });
    expect(seo.robots).toBe("noindex,follow");
    expect(seo.noindexReason).toBe(CITY_MODEL_SEO_REASON.BELOW_MIN_INVENTORY);
  });

  it("sem eligibility, cidade e marca seguem a regra histórica", () => {
    expect(buildClusterSeo(base).robots).toBe("noindex,follow");
    expect(buildClusterSeo({ ...base, activeCount: 3 }).robots).toBe("index,follow");
  });
});

describe("sitemap de modelos consome a mesma elegibilidade", () => {
  const entries = [
    { loc: "/cidade/atibaia-sp/marca/chevrolet/modelo/onix" },
    { loc: "/cidade/braganca-paulista-sp/marca/hyundai/modelo/hb20" },
    { loc: "/cidade/braganca-paulista-sp/marca/volkswagen/modelo/t-cross" },
    { loc: "/cidade/sumiu-sp/marca/fiat/modelo/uno" },
  ];

  it("entra quem é indexável, sai quem é noindex ou não existe; ordem preservada", async () => {
    const verdicts = {
      onix: { indexable: true },
      hb20: { indexable: true },
      "t-cross": { indexable: false },
      uno: null,
    };
    const evaluateEntry = vi.fn(async (_city, _brand, model) => verdicts[model]);
    const out = await filterEligibleModelEntries(entries, evaluateEntry, 2);
    expect(out.map((e) => e.loc)).toEqual([entries[0].loc, entries[1].loc]);
    expect(evaluateEntry).toHaveBeenCalledWith("braganca-paulista-sp", "hyundai", "hb20");
    expect(evaluateEntry).toHaveBeenCalledTimes(4);
  });
});
