// tests/search-policy/f2-scope-facets-relax.test.js
//
// F2 — núcleo puro do ScopeResolver (§4.4 / 8.3), anéis (D5), facetas
// (§5.2 / D6 / E2), variantes de relaxação (§4.7 / D4), chips (§5.4),
// CandidateScope (§4.1 / D3) e ORDER BY do v1 (§4.5). Sem Postgres.
import { beforeEach, describe, expect, it } from "vitest";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";
import {
  GEO_MODE,
  REASON,
  buildRings,
  cumulativeCountAt,
  resolveAutoRadius,
  resolveGeoRequest,
} from "../../src/modules/ads/search-policy/scope-resolver.js";
import {
  assembleFacets,
  computeEntropy,
  decideOpenFacets,
  optionLabel,
  priceBucketOptions,
} from "../../src/modules/ads/search-policy/facets-policy.js";
import { buildRelaxationVariants } from "../../src/modules/ads/search-policy/relaxations.js";
import { buildChips } from "../../src/modules/ads/search-policy/chips.js";
import {
  buildCandidateScope,
  buildProductClauses,
  buildTerritoryClause,
  createParamBag,
} from "../../src/modules/ads/search-policy/candidate-scope.js";
import { buildEngineSortClause } from "../../src/modules/ads/search-policy/engine.js";
import { buildSortClause } from "../../src/modules/ads/filters/ads-filter.sort.js";
import {
  POLICY_CACHE_MAX_KEYS,
  __policyCacheTesting,
  policyCacheBackend,
  policyCacheGet,
  policyCacheInvalidatePrefix,
  policyCacheSet,
} from "../../src/modules/ads/search-policy/policy-cache.js";

const policy = SEARCH_POLICY_DEFAULT;
const BRAGANCA = { id: 4800, slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP" };
const rows = (pairs) => pairs.map(([distance_km, count]) => ({ distance_km, count }));

describe("ScopeResolver — AUTO_RADIUS (8.3)", () => {
  const BROWSE = { target: 20, max_auto_radius: 75, rings_auto: policy.rings_auto };
  it("origem com 33 ACTIVE, BROWSE_CITY → required 0, effective 0, LOCAL_LIQUIDITY_OK", () => {
    expect(
      resolveAutoRadius(
        rows([
          [0, 33],
          [18.34, 1],
        ]),
        BROWSE
      )
    ).toEqual({
      required_distance_km: 0,
      effective_radius_km: 0,
      expanded: false,
      reason: REASON.LOCAL_LIQUIDITY_OK,
    });
  });
  it("origem com 1 + vizinha 33 a 18,34 → required 18.34, effective 25, expanded", () => {
    expect(
      resolveAutoRadius(
        rows([
          [0, 1],
          [15.14, 0],
          [18.34, 33],
        ]),
        BROWSE
      )
    ).toEqual({
      required_distance_km: 18.34,
      effective_radius_km: 25,
      expanded: true,
      reason: REASON.LOW_LOCAL_LIQUIDITY,
    });
  });
  it("remota: 1 + 2(20) + 4(45) + 7(70), BROWSE_CITY → effective 75, CAP_REACHED (14 < 20)", () => {
    expect(
      resolveAutoRadius(
        rows([
          [0, 1],
          [20, 2],
          [45, 4],
          [70, 7],
        ]),
        BROWSE
      )
    ).toEqual({
      required_distance_km: null,
      effective_radius_km: 75,
      expanded: true,
      reason: REASON.AUTO_RADIUS_CAP_REACHED,
    });
  });
  it("SEARCH_MODEL com 0 até 150 → effective 150, CAP_REACHED, count 0", () => {
    const r = resolveAutoRadius(
      rows([
        [0, 0],
        [18.34, 0],
        [120, 0],
      ]),
      { target: 12, max_auto_radius: 150, rings_auto: policy.rings_auto }
    );
    expect(r).toMatchObject({ effective_radius_km: 150, reason: REASON.AUTO_RADIUS_CAP_REACHED });
    expect(
      cumulativeCountAt(
        rows([
          [0, 0],
          [18.34, 0],
          [120, 0],
        ]),
        150
      )
    ).toBe(0);
  });
  it("alcança o target exatamente no limite de um anel → esse anel", () => {
    expect(
      resolveAutoRadius(
        rows([
          [0, 5],
          [25, 15],
        ]),
        BROWSE
      ).effective_radius_km
    ).toBe(25);
    expect(
      resolveAutoRadius(
        rows([
          [0, 5],
          [25.01, 15],
        ]),
        BROWSE
      ).effective_radius_km
    ).toBe(50);
  });
});

describe("ScopeResolver — pedido de geo (raio=/escopo=)", () => {
  it("raio=0 → EXACT_CITY; raio=25 → MANUAL; raio fora de rings_manual → AUTO; escopo", () => {
    expect(resolveGeoRequest({ raio: "0" }, policy, true).mode).toBe(GEO_MODE.EXACT_CITY);
    expect(resolveGeoRequest({ raio: "25" }, policy, true)).toEqual({
      mode: GEO_MODE.MANUAL_RADIUS,
      requested_radius_km: 25,
    });
    expect(resolveGeoRequest({ raio: "33" }, policy, true).mode).toBe(GEO_MODE.AUTO_RADIUS);
    expect(resolveGeoRequest({ raio: "150" }, policy, true).mode).toBe(GEO_MODE.AUTO_RADIUS); // manual máximo é 75 (D5)
    expect(resolveGeoRequest({ escopo: "uf" }, policy, true).mode).toBe(GEO_MODE.STATE);
    expect(resolveGeoRequest({ escopo: "brasil" }, policy, true).mode).toBe(GEO_MODE.NATIONAL);
    expect(resolveGeoRequest({}, policy, false).mode).toBe(GEO_MODE.NATIONAL);
    // state= legado sem origem ⇒ STATE (o legado filtra a.state; o motor não filtra menos)
    expect(resolveGeoRequest({ state: "SP" }, policy, false, { uf: "SP" }).mode).toBe(
      GEO_MODE.STATE
    );
    expect(
      resolveGeoRequest({ state: "SP", escopo: "brasil" }, policy, false, { uf: "SP" }).mode
    ).toBe(GEO_MODE.NATIONAL);
    expect(resolveGeoRequest({}, policy, true).mode).toBe(GEO_MODE.AUTO_RADIUS);
  });
});

describe("Anéis (D5)", () => {
  const liq = rows([
    [0, 1],
    [18.34, 33],
  ]);
  it("rings_manual sempre; auto no anel efetivo; contagem acumulada", () => {
    const r = buildRings(liq, {
      rings_manual: policy.rings_manual,
      effective_radius_km: 25,
      origin: BRAGANCA,
      geoMode: GEO_MODE.AUTO_RADIUS,
    });
    expect(r.map((x) => [x.radius_km, x.count, x.auto === true])).toEqual([
      [0, 1, false],
      [25, 34, true],
      [50, 34, false],
      [75, 34, false],
    ]);
    expect(r[0].label).toBe("Apenas Bragança Paulista");
    expect(r[1].url_params).toEqual({ raio: 25 });
  });
  it("150 só aparece quando effective = 150, com auto:true e SEM url_params", () => {
    const r = buildRings(liq, {
      rings_manual: policy.rings_manual,
      effective_radius_km: 150,
      origin: BRAGANCA,
      geoMode: GEO_MODE.AUTO_RADIUS,
    });
    const last = r[r.length - 1];
    expect(last).toEqual({ radius_km: 150, label: "150 km", count: 34, auto: true });
    expect(
      buildRings(liq, {
        rings_manual: policy.rings_manual,
        effective_radius_km: 75,
        origin: BRAGANCA,
        geoMode: GEO_MODE.AUTO_RADIUS,
      }).some((x) => x.radius_km === 150)
    ).toBe(false);
  });
  it("em MANUAL nenhum anel é 'auto'", () => {
    const r = buildRings(liq, {
      rings_manual: policy.rings_manual,
      effective_radius_km: 25,
      origin: BRAGANCA,
      geoMode: GEO_MODE.MANUAL_RADIUS,
    });
    expect(r.some((x) => x.auto)).toBe(false);
  });
});

describe("Facetas — entropia, abertura (D6), E2, rótulos", () => {
  const opts = (counts) => counts.map((c, i) => ({ value: `v${i}`, count: c }));
  it("entropia: distribuição real de Bragança (25 km)", () => {
    expect(computeEntropy(opts([6, 20, 6, 2]))).toBeCloseTo(1.574, 2); // preço
    expect(computeEntropy(opts([7, 7, 6, 4, 3, 2, 2, 2, 1]))).toBeCloseTo(2.923, 2); // marca
    expect(computeEntropy(opts([6, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]))).toBeCloseTo(
      3.866,
      2
    ); // modelo
    expect(computeEntropy(opts([23, 11]))).toBeCloseTo(0.908, 2);
    expect(computeEntropy(opts([34]))).toBe(0);
  });
  it("D6: preço abre sempre e conta no open_max → Bragança abre price, commercial_model, brand", () => {
    const facets = [
      { key: "price", entropy: 1.574, active_value: null },
      { key: "brand", entropy: 2.923, active_value: null },
      { key: "commercial_model", entropy: 3.866, active_value: null },
      { key: "year", entropy: 2.153, active_value: null },
      { key: "transmission", entropy: 0.908, active_value: null },
    ];
    const open = decideOpenFacets(facets, policy)
      .filter((f) => f.open)
      .map((f) => f.key);
    expect(open.sort()).toEqual(["brand", "commercial_model", "price"]);
  });
  it("faceta ativa abre sempre e NÃO consome vaga", () => {
    const facets = [
      { key: "price", entropy: 1.5, active_value: null },
      { key: "brand", entropy: 2.9, active_value: null },
      { key: "commercial_model", entropy: 3.8, active_value: null },
      { key: "transmission", entropy: 0.9, active_value: "automatico" },
    ];
    const open = decideOpenFacets(facets, policy)
      .filter((f) => f.open)
      .map((f) => f.key);
    expect(open.sort()).toEqual(["brand", "commercial_model", "price", "transmission"]);
  });
  it("assembleFacets: count 0 fora, opção ativa dentro (E2), 1 opção fora salvo ativa, versão só com modelo", () => {
    const rowsByKey = new Map([
      [
        "transmission",
        [
          { value: "manual", count: 3 },
          { value: "automatico", count: 0 },
        ],
      ],
      ["fuel", [{ value: "flex", count: 34 }]],
      [
        "brand",
        [
          { value: "GM - Chevrolet", count: 6 },
          { value: "Fiat", count: 7 },
        ],
      ],
    ]);
    const f = assembleFacets(rowsByKey, { transmission: "automatico" }, policy);
    const t = f.find((x) => x.key === "transmission");
    expect(t.options).toEqual([
      { value: "automatico", label: "Automático", count: 0, active: true },
      { value: "manual", label: "Manual", count: 3 },
    ]);
    expect(t.open).toBe(true);
    expect(f.find((x) => x.key === "fuel")).toBeUndefined(); // 1 opção, não ativa
    expect(f.find((x) => x.key === "version")).toBeUndefined();
    expect(f.find((x) => x.key === "brand").options[0]).toEqual({
      value: "Fiat",
      label: "Fiat",
      count: 7,
    });
  });
  it("rótulos: marca com prefixo de grupo, faixas de preço", () => {
    expect(optionLabel("brand", "GM - Chevrolet")).toBe("Chevrolet");
    expect(optionLabel("transmission", "automatico")).toBe("Automático");
    const p = priceBucketOptions(policy.facets.price_buckets);
    expect(p[0]).toEqual({ index: 0, value: "0-40000", label: "até R$ 40 mil" });
    expect(p[2]).toEqual({ index: 2, value: "60000-80000", label: "R$ 60 mil a R$ 80 mil" });
    expect(p[p.length - 1].label).toBe("acima de R$ 300 mil");
  });
});

describe("Relaxações — variantes (§4.7, D4)", () => {
  const ctx = (filters, profile = "SEARCH_MODEL", max = 150) => ({
    filters,
    origin: BRAGANCA,
    intent: { profile, max_auto_radius: max, target: policy.profiles[profile].target },
    uf: "SP",
  });
  it("contexto 2: transmission (remover) e price_max 75000 → 87000 (fórmula); radius ausente em 150", () => {
    const v = buildRelaxationVariants(
      ctx({ commercial_model: "Onix", transmission: "automatico", price_max: 75000 }),
      { geo_mode: GEO_MODE.AUTO_RADIUS, effective_radius_km: 150 },
      policy
    );
    expect(v.map((x) => x.dimension)).toEqual(["price_max", "transmission"]);
    expect(v.find((x) => x.dimension === "price_max")).toMatchObject({
      label: "subir o teto para R$ 87 mil",
      url_params: { price_max: 87000 },
    });
    expect(v.find((x) => x.dimension === "transmission")).toMatchObject({
      label: "aceitar câmbio manual",
      url_params: { transmission: null },
    });
  });
  it("radius: próximo anel de rings_manual; SEARCH_* chega a 150; BROWSE para em 75", () => {
    expect(
      buildRelaxationVariants(
        ctx({}),
        { geo_mode: GEO_MODE.AUTO_RADIUS, effective_radius_km: 25 },
        policy
      )[0]
    ).toMatchObject({ dimension: "radius", label: "ampliar para 50 km", url_params: { raio: 50 } });
    expect(
      buildRelaxationVariants(
        ctx({}),
        { geo_mode: GEO_MODE.MANUAL_RADIUS, effective_radius_km: 75 },
        policy
      )[0]
    ).toMatchObject({ dimension: "radius", label: "ampliar para 150 km" });
    expect(
      buildRelaxationVariants(
        ctx({}, "BROWSE_CITY", 75),
        { geo_mode: GEO_MODE.AUTO_RADIUS, effective_radius_km: 75 },
        policy
      )
    ).toEqual([]);
  });
  it("year_from −2 (mínimo 1990), mileage_max +25 % arredondado a 5.000, remoções com os textos de §7.6", () => {
    const v = buildRelaxationVariants(
      ctx({
        year_from: 1991,
        mileage_max: 80000,
        fuel: "flex",
        body_type: "suv",
        seller_kind: "dealer",
        transmission: "manual",
      }),
      { geo_mode: GEO_MODE.EXACT_CITY, effective_radius_km: 0 },
      policy
    );
    const by = Object.fromEntries(v.map((x) => [x.dimension, x]));
    expect(by.year_from).toMatchObject({
      label: "aceitar a partir de 1990",
      url_params: { year_min: 1990 },
    });
    expect(by.mileage_max).toMatchObject({
      label: "aceitar até 100.000 km",
      url_params: { mileage_max: 100000 },
    });
    expect(by.transmission.label).toBe("aceitar câmbio automático");
    expect(by.fuel.label).toBe("qualquer combustível");
    expect(by.body_type.label).toBe("qualquer carroceria");
    expect(by.seller_kind.label).toBe("lojas e particulares");
    expect(by.radius).toMatchObject({ label: "ampliar para 25 km" });
  });
});

describe("Chips (§5.4, §7.2)", () => {
  const base = { origin: BRAGANCA, location_source: "CITY_PAGE", uf: "SP" };
  it("página de cidade: chip de origem não removível; AUTO/MANUAL/EXACT", () => {
    expect(
      buildChips(
        { ...base, filters: {} },
        { geo_mode: GEO_MODE.AUTO_RADIUS, effective_radius_km: 25 }
      )
    ).toEqual([
      {
        key: "geo",
        label: "Bragança Paulista · 25 km (automático)",
        removable: false,
        remove_params: [],
      },
    ]);
    expect(
      buildChips(
        { ...base, filters: {} },
        { geo_mode: GEO_MODE.MANUAL_RADIUS, effective_radius_km: 50 }
      )[0].label
    ).toBe("Bragança Paulista · 50 km");
    expect(
      buildChips(
        { ...base, filters: {} },
        { geo_mode: GEO_MODE.EXACT_CITY, effective_radius_km: 0 }
      )[0].label
    ).toBe("Apenas Bragança Paulista");
  });
  it("/comprar com origem escolhida: removível; um chip por parâmetro", () => {
    const chips = buildChips(
      {
        ...base,
        location_source: "USER_SELECTED",
        filters: {
          commercial_model: "Onix",
          transmission: "automatico",
          price_max: 75000,
          year_from: 2020,
          year_to: 2023,
        },
      },
      { geo_mode: GEO_MODE.AUTO_RADIUS, effective_radius_km: 150 }
    );
    expect(chips.map((c) => c.label)).toEqual([
      "Onix",
      "2020–2023",
      "até R$ 75 mil",
      "Automático",
      "Bragança Paulista · 150 km (automático)",
    ]);
    expect(chips[chips.length - 1].removable).toBe(true);
    expect(chips.find((c) => c.key === "price").remove_params).toEqual(["price_min", "price_max"]);
  });
});

describe("CandidateScope (§4.1, D3) e ORDER BY (§4.5)", () => {
  it("território: subconsulta única em modos com origem (EXACT usa 0); UF em STATE; nada em NATIONAL", () => {
    const bag = createParamBag();
    expect(buildTerritoryClause({ mode: "AUTO_RADIUS", originId: 4800, radiusKm: 25 }, bag)).toBe(
      "a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)"
    );
    expect(bag.params).toEqual([4800, 25]);
    const b2 = createParamBag();
    buildTerritoryClause({ mode: "EXACT_CITY", originId: 4800, radiusKm: 0 }, b2);
    expect(b2.params).toEqual([4800, 0]);
    const b3 = createParamBag();
    expect(buildTerritoryClause({ mode: "STATE", uf: "sp" }, b3)).toBe("UPPER(a.state) = $1");
    expect(b3.params).toEqual(["SP"]);
    expect(buildTerritoryClause({ mode: "NATIONAL" }, createParamBag())).toBeNull();
  });
  it("produto: commercial_model por igualdade case-insensitive; exclude retira a dimensão; q registra o índice", () => {
    const bag = createParamBag();
    const p = buildProductClauses(
      { commercial_model: "Onix", transmission: "automatico", price_max: 75000, q: "ltz" },
      bag
    );
    expect(p.clauses).toEqual([
      "a.search_vector @@ plainto_tsquery('portuguese', $1)",
      "LOWER(a.commercial_model) = LOWER($2)",
      "a.price <= $3",
      "(COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $4)",
    ]);
    expect(p.qParam).toBe("$1");
    expect(bag.params).toEqual(["ltz", "Onix", 75000, "%automatico%"]);
    const ex = buildProductClauses(
      { commercial_model: "Onix", transmission: "automatico" },
      createParamBag(),
      { exclude: ["transmission"] }
    );
    expect(ex.clauses).toEqual(["LOWER(a.commercial_model) = LOWER($1)"]);
  });
  it("uma só cláusula territorial no WHERE; os quatro JOINs sempre presentes", () => {
    const s = buildCandidateScope({
      filters: { brand: "Fiat" },
      territory: { mode: "MANUAL_RADIUS", originId: 1, radiusKm: 50, uf: "SP" },
    });
    expect((s.whereClause.match(/region_memberships/g) || []).length).toBe(1);
    expect(s.whereClause).not.toContain("a.state");
    expect(s.joins).toMatch(/LEFT JOIN cities c/);
    expect(s.joins).toMatch(/LEFT JOIN advertisers adv/);
    expect(s.joins).toMatch(/LEFT JOIN users u/);
    expect(s.joins).toMatch(/LEFT JOIN subscription_plans sp/);
  });
  it("relevance v1: peso → distância → text_rank (só com q) → recência → id; outros sorts iguais ao legado", () => {
    const withAll = buildEngineSortClause("relevance", { hasOrigin: true, hasText: true }).replace(
      /\s+/g,
      " "
    );
    expect(withAll).toMatch(
      /GREATEST\(.*\) DESC, COALESCE\(rm\.distance_km, 0\) ASC, text_rank DESC, a\.created_at DESC, a\.id ASC$/
    );
    const noText = buildEngineSortClause("relevance", { hasOrigin: true, hasText: false });
    expect(noText).not.toContain("text_rank");
    expect(noText).not.toContain("hybrid_score");
    const national = buildEngineSortClause("relevance", { hasOrigin: false, hasText: false });
    expect(national).not.toContain("distance_km");
    for (const sort of [
      "price_asc",
      "price_desc",
      "recent",
      "year_desc",
      "mileage_asc",
      "highlight",
    ]) {
      expect(buildEngineSortClause(sort, { hasOrigin: true, hasText: true })).toBe(
        buildSortClause(sort, { useTextRank: false })
      );
    }
  });
});

describe("policy-cache — LRU em memória (instrução A, E4)", () => {
  beforeEach(() => __policyCacheTesting.reset());
  it("sem Redis o backend é memória; get/set/TTL", async () => {
    expect(policyCacheBackend()).toBe("memory");
    await policyCacheSet("sp:liq:1", { a: 1 }, 60);
    expect(await policyCacheGet("sp:liq:1")).toEqual({ a: 1 });
    expect(await policyCacheGet("sp:liq:nope")).toBeUndefined();
  });
  it("respeita TTL", async () => {
    await policyCacheSet("sp:relax:x", [1], 1);
    const entry = __policyCacheTesting.keys();
    expect(entry).toContain("sp:relax:x");
    await new Promise((r) => setTimeout(r, 1100));
    expect(await policyCacheGet("sp:relax:x")).toBeUndefined();
  });
  it("teto de 200 chaves com evicção do menos recente", async () => {
    expect(POLICY_CACHE_MAX_KEYS).toBe(200);
    for (let i = 0; i < 205; i += 1) await policyCacheSet(`sp:liq:k${i}`, i, 900);
    expect(__policyCacheTesting.size()).toBe(200);
    expect(await policyCacheGet("sp:liq:k0")).toBeUndefined();
    expect(await policyCacheGet("sp:liq:k204")).toBe(204);
  });
  it("invalidação por prefixo", async () => {
    await policyCacheSet("sp:liq:a", 1, 900);
    await policyCacheSet("sp:relax:b", 2, 900);
    expect(await policyCacheInvalidatePrefix("sp:liq")).toBe(1);
    expect(await policyCacheGet("sp:liq:a")).toBeUndefined();
    expect(await policyCacheGet("sp:relax:b")).toBe(2);
  });
});
