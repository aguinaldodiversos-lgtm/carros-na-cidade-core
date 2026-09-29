// tests/search-policy/dec30-city-model-seo-eligibility.integration.test.js
//
// DEC-30 contra Postgres real: a elegibilidade SEO da landing cidade + marca +
// modelo segue o MODO SERVIDO da listagem. Com o motor servindo, conta o
// território canônico (`countSearchPolicyTerritory`); com o legado servindo
// (flag off, cidade fora da allowlist), vale o estoque próprio (DEC-29). O modo
// é o mesmo que o controller de /api/ads/search usa — provado abaixo contra
// `runSearchPolicyEngineIfAllowed`, a porta real.
//
// Fixture espelha o caso que motivou a decisão: 3 do modelo em Atibaia e 1 em
// Bragança Paulista (18,34 km, dentro do piso de 25 km).
//
// O limiar NÃO é injetado: vem da política central pela taxonomia da URL
// (`seoSurfaceForModelTaxonomy`) — modelo comercial = 1 (âncora local), URL
// antiga por descrição FIPE = base (3). É o mesmo caminho da página e do
// sitemap.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withF2Fixture } from "./helpers/f2-fixture.js";
import {
  countSearchPolicyTerritory,
  runSearchPolicyEngine,
  runSearchPolicyEngineIfAllowed,
} from "../../src/modules/ads/search-policy/engine.js";
import { resetDictionariesForTests } from "../../src/modules/ads/search-policy/dictionaries.js";
import { __policyCacheTesting } from "../../src/modules/ads/search-policy/policy-cache.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";
import { evaluateCityModelSeoEligibility } from "../../src/read-models/cities/city-model-seo-eligibility.js";

describe.sequential("DEC-30 — elegibilidade SEO pelo território do motor (Postgres real)", () => {
  let db;
  let ids;
  let done;
  const policy = SEARCH_POLICY_DEFAULT;
  const savedEnv = {
    SEARCH_POLICY_ENGINE: process.env.SEARCH_POLICY_ENGINE,
    SEARCH_POLICY_ENGINE_CITIES: process.env.SEARCH_POLICY_ENGINE_CITIES,
  };

  const query = (citySlug) => ({
    city_slug: citySlug,
    brand: "Hyundai",
    commercial_model: "Hb30s",
  });
  const count = (citySlug) =>
    countSearchPolicyTerritory(query(citySlug), { db, policy, cache: false });
  // Estoque próprio de cada cidade na fixture — é o que o legado lista.
  const OWN = { "atibaia-sp": 3, "braganca-paulista-sp": 1, "vargem-sp": 0 };
  // Taxonomia que `resolveCityModel` devolveria: cidade sem o modelo = "none"
  // (rótulo sai do dicionário nacional), com o modelo = "commercial".
  const TAXONOMY = {
    "atibaia-sp": "commercial",
    "braganca-paulista-sp": "commercial",
    "vargem-sp": "none",
  };
  const eligibility = (citySlug) =>
    evaluateCityModelSeoEligibility(
      {
        citySlug,
        listingFilters: { brand: "Hyundai", commercial_model: "Hb30s" },
        ownActiveCount: OWN[citySlug],
        taxonomy: TAXONOMY[citySlug],
      },
      { db, policy, cache: false }
    );

  beforeAll(async () => {
    const fixture = new Promise((resolve, reject) => {
      withF2Fixture("dec30", async (f) => {
        resolve(f);
        await new Promise((r) => (done = r));
      }).catch(reject);
    });
    const f = await fixture;
    db = f.db;
    ids = f.ids;
    resetDictionariesForTests();
    __policyCacheTesting.reset();

    let n = 0;
    const ad = async (advertiserId, citySlug, cityName) => {
      n += 1;
      await db.query(
        `INSERT INTO ads (advertiser_id, city_id, city, state, title, brand, model, commercial_model,
                          price, year, mileage, transmission, fuel_type, body_type,
                          plan, priority, status, slug, created_at, updated_at, images)
         VALUES ($1,$2,$3,'SP',$4,'Hyundai',$5,'Hb30s',60000,2022,40000,'manual','flex','hatch',
                 'free',1,'active',$6,NOW(),NOW(),'[]'::jsonb)`,
        [
          advertiserId,
          ids.cities[citySlug],
          cityName,
          `Hb30s ${n}`,
          `HB30S 1.0 FIPE ${n}`,
          `dec30-hb30s-${n}`,
        ]
      );
    };
    for (let i = 0; i < 3; i++) await ad(ids.advertisers.ittmotors, "atibaia-sp", "Atibaia");
    await ad(ids.advertisers.pfBraganca, "braganca-paulista-sp", "Bragança Paulista");
  }, 300000);

  beforeEach(() => {
    process.env.SEARCH_POLICY_ENGINE = "v1";
    process.env.SEARCH_POLICY_ENGINE_CITIES = "*";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  afterAll(async () => {
    if (done) done();
    await new Promise((r) => setTimeout(r, 100));
  });

  it("motor ON — Bragança: 1 próprio + 4 no território → index", async () => {
    const t = await count("braganca-paulista-sp");
    expect(t.origin_city.slug).toBe("braganca-paulista-sp");
    expect(t.local_result_count).toBe(1);
    expect(t.total_result_count).toBe(4);
    const e = await eligibility("braganca-paulista-sp");
    expect(e).toMatchObject({
      indexable: true,
      serving_mode: "search_policy",
      local_model_count: 1,
      regional_model_count: 4,
      // Limiar do modelo comercial, vindo da política central.
      min_inventory: 1,
    });
  });

  it("motor ON — Atibaia: 3 próprios → index", async () => {
    const e = await eligibility("atibaia-sp");
    expect(e.indexable).toBe(true);
    expect(e.local_model_count).toBe(3);
  });

  it("motor ON — Vargem: 0 próprios, vizinhas com estoque → noindex", async () => {
    const t = await count("vargem-sp");
    expect(t.local_result_count).toBe(0);
    expect(t.total_result_count).toBeGreaterThan(0);
    const e = await eligibility("vargem-sp");
    expect(e.indexable).toBe(false);
    expect(e.noindexReason).toBe("no_local_anchor");
  });

  it("motor ON — modelo inexistente → território vazio → noindex", async () => {
    const e = await evaluateCityModelSeoEligibility(
      {
        citySlug: "braganca-paulista-sp",
        listingFilters: { brand: "Hyundai", commercial_model: "Naoexiste" },
        ownActiveCount: 0,
        taxonomy: "none",
      },
      { db, policy, cache: false }
    );
    expect(e.indexable).toBe(false);
    expect(e.regional_model_count).toBe(0);
  });

  it("a contagem é a do conjunto que a listagem do motor mostra", async () => {
    const t = await count("braganca-paulista-sp");
    const page = await runSearchPolicyEngine(query("braganca-paulista-sp"), {
      db,
      policy,
      cache: false,
      telemetry: false,
    });
    expect(page.pagination.total).toBe(t.total_result_count);
    expect(page.search_policy.local_result_count).toBe(t.local_result_count);
  });

  it("a allowlist decide o modo servido; a âncora local de 1 indexa nos dois modos (porta real do controller)", async () => {
    // Com o limiar comercial em 1, motor (local>=1 AND regional>=1) e legado
    // (local>=1) coincidem para Bragança (1 próprio). O que a allowlist muda é
    // o modo servido e o conjunto exibido (regional só no motor).
    const q = query("braganca-paulista-sp");
    // O controller só chega a runSearchPolicyEngineIfAllowed com a flag v1; com
    // outra flag a resposta é legado sem nem perguntar.
    const servedByEngine = async () =>
      process.env.SEARCH_POLICY_ENGINE === "v1" &&
      (await runSearchPolicyEngineIfAllowed(q, { db, policy, cache: false, telemetry: false })) !==
        null;

    const scenarios = [
      ["v1", "*", "search_policy", true, 4],
      ["v1", "atibaia-sp,braganca-paulista-sp", "search_policy", true, 4],
      ["v1", "atibaia-sp", "legacy", true, null],
      ["off", "*", "legacy", true, null],
    ];
    for (const [flag, cities, mode, indexable, regional] of scenarios) {
      process.env.SEARCH_POLICY_ENGINE = flag;
      process.env.SEARCH_POLICY_ENGINE_CITIES = cities;
      const e = await eligibility("braganca-paulista-sp");
      expect({ flag, cities, served: await servedByEngine() }).toEqual({
        flag,
        cities,
        served: mode === "search_policy",
      });
      expect(e).toMatchObject({
        serving_mode: mode,
        indexable,
        local_model_count: 1,
        regional_model_count: regional,
      });
    }
  });

  it("motor OFF — Atibaia com 3 próprios exibidos → index pela regra de DEC-29", async () => {
    process.env.SEARCH_POLICY_ENGINE = "off";
    const e = await eligibility("atibaia-sp");
    expect(e).toMatchObject({ serving_mode: "legacy", indexable: true, local_model_count: 3 });
  });

  it("motor OFF — Bragança com 1 próprio → index (âncora local, limiar comercial)", async () => {
    process.env.SEARCH_POLICY_ENGINE = "off";
    const e = await eligibility("braganca-paulista-sp");
    expect(e).toMatchObject({
      serving_mode: "legacy",
      indexable: true,
      local_model_count: 1,
      min_inventory: 1,
    });
  });

  it("motor OFF — Vargem com 0 próprios → noindex, mesmo com vizinhas", async () => {
    process.env.SEARCH_POLICY_ENGINE = "off";
    const e = await eligibility("vargem-sp");
    expect(e).toMatchObject({ serving_mode: "legacy", indexable: false });
  });

  it("URL antiga por descrição FIPE (motor ligado) segue legado com limiar base", async () => {
    // `model` está fora do contrato do motor: a URL é servida pelo legado e
    // julgada pela família `modelFipeLegacy` — 1-2 anúncios não indexam.
    const fipe = (own) =>
      evaluateCityModelSeoEligibility(
        {
          citySlug: "atibaia-sp",
          listingFilters: { brand: "Hyundai", model: "HB30S 1.0 FIPE 1" },
          ownActiveCount: own,
          taxonomy: "fipe",
        },
        { db, policy, cache: false }
      );
    for (const [own, indexable] of [
      [1, false],
      [2, false],
      [3, true],
    ]) {
      expect(await fipe(own)).toMatchObject({
        serving_mode: "legacy",
        serving_reason: "unsupported_params",
        indexable,
        min_inventory: 3,
      });
    }
  });

  it("chave fora do contrato do motor (`model`) não é contada", async () => {
    await expect(
      countSearchPolicyTerritory(
        { city_slug: "atibaia-sp", brand: "Hyundai", model: "HB30S" },
        { db, policy, cache: false }
      )
    ).rejects.toThrow(/fora do contrato/);
  });
});
