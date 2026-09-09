// tests/search-policy/f2-resolvers.test.js
//
// F2 — testes PUROS dos resolvedores (§4.2 / 8.5, §4.3, texto D2). Sem Postgres:
// os dicionários e o `db` são stubs.
import { describe, expect, it } from "vitest";
import {
  buildResidualQuery,
  extractPriceSignals,
  extractYearSignals,
  matchWordBoundary,
  normalizeText,
} from "../../src/modules/ads/search-policy/text.js";
import { resolveProduct } from "../../src/modules/ads/search-policy/product-resolver.js";
import {
  LOCATION_SOURCE,
  detectExplicitCity,
  resolveLocation,
} from "../../src/modules/ads/search-policy/location-resolver.js";
import { resolveIntent } from "../../src/modules/ads/search-policy/intent-resolver.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";
import {
  FLAG_OFF,
  FLAG_SHADOW,
  FLAG_V1,
  getSearchPolicyFlag,
  isOriginAllowed,
} from "../../src/modules/ads/search-policy/flag.js";

const BRANDS = [
  { original: "Fiat", normalized: "fiat", suffix: null, total: 7 },
  { original: "GM - Chevrolet", normalized: "gm - chevrolet", suffix: "chevrolet", total: 6 },
  { original: "VW - VolksWagen", normalized: "vw - volkswagen", suffix: "volkswagen", total: 7 },
];
const MODELS = [
  {
    label: "Onix",
    normalized: "onix",
    brand: "GM - Chevrolet",
    brandNormalized: "gm - chevrolet",
    total: 6,
  },
  { label: "HB20", normalized: "hb20", brand: "Hyundai", brandNormalized: "hyundai", total: 4 },
  { label: "Omoda 5", normalized: "omoda 5", brand: "Omoda", brandNormalized: "omoda", total: 1 },
];
const DICT = { brands: BRANDS, commercialModels: MODELS };

const ACTIVE_CITIES = [
  {
    id: 4761,
    slug: "atibaia-sp",
    name: "Atibaia",
    state: "SP",
    normalized: "atibaia",
    active: 33,
    latitude: -23.1,
    longitude: -46.5,
  },
  {
    id: 4800,
    slug: "braganca-paulista-sp",
    name: "Bragança Paulista",
    state: "SP",
    normalized: "braganca paulista",
    active: 1,
    latitude: -22.9,
    longitude: -46.5,
  },
];
const CITY_ROWS = {
  "atibaia-sp": {
    id: 4761,
    slug: "atibaia-sp",
    name: "Atibaia",
    state: "SP",
    latitude: -23.1171,
    longitude: -46.5563,
  },
  "braganca-paulista-sp": {
    id: 4800,
    slug: "braganca-paulista-sp",
    name: "Bragança Paulista",
    state: "SP",
    latitude: -22.9527,
    longitude: -46.5419,
  },
  "ico-ce": { id: 696, slug: "ico-ce", name: "Icó", state: "CE", latitude: -6.4, longitude: -38.8 },
};
/** db stub: só entende as duas consultas do LocationResolver. */
const dbStub = {
  async query(sql, params) {
    if (/WHERE slug = \$1/.test(sql))
      return { rows: CITY_ROWS[params[0]] ? [CITY_ROWS[params[0]]] : [] };
    if (/WHERE id = \$1/.test(sql)) {
      const row = Object.values(CITY_ROWS).find((c) => c.id === Number(params[0]));
      return { rows: row ? [row] : [] };
    }
    throw new Error(`stub sem resposta para: ${sql.slice(0, 60)}`);
  },
};
const deps = { db: dbStub, activeCities: ACTIVE_CITIES };
const policy = SEARCH_POLICY_DEFAULT;

describe("text.js — fronteira de palavra (D2)", () => {
  it("'ico' NÃO casa dentro de 'automatico'; 'at' NÃO casa dentro de 'atibaia' nem 'fiat'", () => {
    expect(matchWordBoundary(normalizeText("onix automático até 75 mil"), "ico")).toBeNull();
    expect(matchWordBoundary(normalizeText("onix em atibaia"), "at")).toBeNull();
    expect(matchWordBoundary(normalizeText("fiat uno"), "at")).toBeNull();
  });
  it("casa palavra inteira, com acento normalizado e frase composta", () => {
    expect(matchWordBoundary(normalizeText("onix automático"), "automatico")).not.toBeNull();
    expect(matchWordBoundary(normalizeText("gol at 2020"), "at")).not.toBeNull();
    expect(matchWordBoundary(normalizeText("Omoda 5 luxury"), "omoda 5")).not.toBeNull();
  });
  it("preço e ano — mesmas regras do legado", () => {
    expect(extractPriceSignals("onix até 75 mil")).toEqual({
      min_price: undefined,
      max_price: 75000,
    });
    expect(extractPriceSignals("entre 40 e 60 mil")).toEqual({
      min_price: 40000,
      max_price: 60000,
    });
    expect(extractYearSignals("onix 2020")).toEqual({ year_min: 2020, year_max: 2020 });
    expect(extractYearSignals("onix 2018 a 2021")).toEqual({ year_min: 2018, year_max: 2021 });
  });
  it("residual: remove o consumido e aceita UM token (DEFAULT §12)", () => {
    const t = normalizeText("onix ltz automatico ate 75 mil");
    expect(
      buildResidualQuery(t, [matchWordBoundary(t, "onix"), matchWordBoundary(t, "automatico")])
    ).toBe("ltz");
    // "carro" e "em" sao stopwords do legado (ads-free-query.constants.js) - mesma lista, mesmo resultado.
    expect(buildResidualQuery(normalizeText("carro em bom estado"), [])).toBe("bom estado");
  });
});

describe("product-resolver — resolvedor v1", () => {
  it("'onix automático até 75 mil' → Onix + automatico + 75000, residual vazio, sem marca implícita", () => {
    const r = resolveProduct("onix automático até 75 mil", {}, DICT);
    expect(r.filters).toEqual({
      commercial_model: "Onix",
      transmission: "automatico",
      price_max: 75000,
    });
    expect(r.residual_q).toBe("");
    expect(r.consumed).toEqual(["commercial_model", "transmission"]);
  });
  it("'fiat uno' → marca Fiat, SEM câmbio automático (era o bug 'at')", () => {
    const r = resolveProduct("fiat uno", {}, DICT);
    expect(r.filters.brand).toBe("Fiat");
    expect(r.filters.transmission).toBeUndefined();
    expect(r.residual_q).toBe("uno");
  });
  it("'onix ltz' → SEARCH_VERSION: commercial_model + residual 'ltz'", () => {
    const r = resolveProduct("onix ltz", {}, DICT);
    expect(r.filters.commercial_model).toBe("Onix");
    expect(r.residual_q).toBe("ltz");
  });
  it("parâmetro explícito vence o inferido; inferido não é apagado por explícito ausente", () => {
    const r = resolveProduct("onix automático", { transmission: "manual", year_min: 2020 }, DICT);
    expect(r.filters.transmission).toBe("manual");
    expect(r.filters.commercial_model).toBe("Onix");
    expect(r.filters.year_from).toBe(2020);
  });
  it("marca por sufixo ('chevrolet' casa 'GM - Chevrolet'); modelo Omoda 5 (composto)", () => {
    expect(resolveProduct("chevrolet 2021", {}, DICT).filters.brand).toBe("GM - Chevrolet");
    expect(resolveProduct("omoda 5", {}, DICT).filters.commercial_model).toBe("Omoda 5");
  });
  it("sem texto: só os explícitos, com nomes internos", () => {
    const r = resolveProduct("", { fuel_type: "flex", price_min: 10000, max_price: 50000 }, DICT);
    expect(r.filters).toEqual({ fuel: "flex", price_min: 10000, price_max: 50000 });
  });
});

describe("location-resolver — §4.2 + D1 (8.5)", () => {
  it("'carro em bom estado' não muda a origem", () => {
    expect(
      detectExplicitCity("carro em bom estado", policy.explicit_query_patterns, ACTIVE_CITIES)
    ).toBeNull();
  });
  it("'onix em atibaia' na página de Bragança → origem atibaia, EXPLICIT_QUERY, q sem a cidade", async () => {
    const r = await resolveLocation(
      { city_slug: "braganca-paulista-sp", q: "onix em atibaia" },
      policy,
      deps
    );
    expect(r.origin.slug).toBe("atibaia-sp");
    expect(r.location_source).toBe(LOCATION_SOURCE.EXPLICIT_QUERY);
    expect(r.q).toBe("onix");
  });
  it("'onix em cidadeinexistente' → q intacto, origem intacta (página)", async () => {
    const r = await resolveLocation(
      { city_slug: "braganca-paulista-sp", q: "onix em cidadeinexistente" },
      policy,
      deps
    );
    expect(r.origin.slug).toBe("braganca-paulista-sp");
    expect(r.location_source).toBe(LOCATION_SOURCE.CITY_PAGE);
    expect(r.q).toBe("onix em cidadeinexistente");
  });
  it("'onix automático até 75 mil' com origem=atibaia-sp → CITY_PAGE (D1), Icó NÃO entra", async () => {
    const r = await resolveLocation(
      { origem: "atibaia-sp", q: "onix automático até 75 mil" },
      policy,
      deps
    );
    expect(r.origin.slug).toBe("atibaia-sp");
    expect(r.location_source).toBe(LOCATION_SOURCE.CITY_PAGE);
  });
  it("origem_src=user → USER_SELECTED e vence a cidade explícita do texto", async () => {
    const r = await resolveLocation(
      { origem: "braganca-paulista-sp", origem_src: "user", q: "onix em atibaia" },
      policy,
      deps
    );
    expect(r.origin.slug).toBe("braganca-paulista-sp");
    expect(r.location_source).toBe(LOCATION_SOURCE.USER_SELECTED);
    expect(r.q).toBe("onix em atibaia");
  });
  it("origem_src=geo → GEOLOCATION; =session → SESSION_DEFAULT; texto explícito vence os dois", async () => {
    expect(
      (await resolveLocation({ origem: "atibaia-sp", origem_src: "geo" }, policy, deps))
        .location_source
    ).toBe(LOCATION_SOURCE.GEOLOCATION);
    expect(
      (await resolveLocation({ origem: "atibaia-sp", origem_src: "session" }, policy, deps))
        .location_source
    ).toBe(LOCATION_SOURCE.SESSION_DEFAULT);
    const r = await resolveLocation(
      { origem: "atibaia-sp", origem_src: "geo", q: "hb20 em braganca paulista" },
      policy,
      deps
    );
    expect(r.origin.slug).toBe("braganca-paulista-sp");
    expect(r.location_source).toBe(LOCATION_SOURCE.EXPLICIT_QUERY);
  });
  it("território legado: city_slugs[0] e city_id viram CITY_PAGE; nada → NONE com UF do state", async () => {
    expect(
      (await resolveLocation({ city_slugs: ["braganca-paulista-sp", "atibaia-sp"] }, policy, deps))
        .origin.slug
    ).toBe("braganca-paulista-sp");
    expect((await resolveLocation({ city_id: 4761 }, policy, deps)).origin.slug).toBe("atibaia-sp");
    const none = await resolveLocation({ state: "sp" }, policy, deps);
    expect(none.origin).toBeNull();
    expect(none.location_source).toBe(LOCATION_SOURCE.NONE);
    expect(none.uf).toBe("SP");
  });
  it("cidade explícita sem estoque (Icó) não move a origem mesmo com 'em '", async () => {
    const r = await resolveLocation({ origem: "atibaia-sp", q: "onix em ico" }, policy, deps);
    expect(r.origin.slug).toBe("atibaia-sp");
    expect(r.q).toBe("onix em ico");
  });
});

describe("intent-resolver — §4.3", () => {
  const p = policy;
  it("tabela de perfis", () => {
    expect(resolveIntent({}, "", p)).toMatchObject({
      profile: "BROWSE_CITY",
      specificity: 0,
      target: 20,
      max_auto_radius: 75,
    });
    expect(resolveIntent({ body_type: "suv", price_max: 80000 }, "", p)).toMatchObject({
      profile: "BROWSE_CATEGORY",
      specificity: 2,
      target: 16,
    });
    expect(resolveIntent({ seller_kind: "dealer" }, "", p).profile).toBe("BROWSE_CATEGORY");
    expect(resolveIntent({ brand: "Fiat" }, "", p)).toMatchObject({
      profile: "SEARCH_BRAND",
      target: 16,
      max_auto_radius: 150,
    });
    expect(
      resolveIntent(
        { commercial_model: "Onix", transmission: "automatico", price_max: 75000 },
        "",
        p
      )
    ).toMatchObject({ profile: "SEARCH_MODEL", specificity: 3, target: 12 });
    expect(resolveIntent({ commercial_model: "Onix", year_from: 2020 }, "", p)).toMatchObject({
      profile: "SEARCH_MODEL_YEAR",
      target: 8,
    });
    expect(resolveIntent({ commercial_model: "Onix" }, "ltz", p)).toMatchObject({
      profile: "SEARCH_VERSION",
      specificity: 2,
      target: 4,
    });
  });
  it("empate resolve pela linha mais específica (versão > modelo+ano > modelo > marca)", () => {
    expect(
      resolveIntent({ brand: "Fiat", commercial_model: "Argo", year_to: 2022 }, "trekking", p)
        .profile
    ).toBe("SEARCH_VERSION");
    expect(
      resolveIntent({ brand: "Fiat", commercial_model: "Argo", year_to: 2022 }, "", p).profile
    ).toBe("SEARCH_MODEL_YEAR");
  });
});

describe("flag", () => {
  it("modo e allowlist", () => {
    expect(getSearchPolicyFlag({})).toBe(FLAG_OFF);
    expect(getSearchPolicyFlag({ SEARCH_POLICY_ENGINE: "SHADOW" })).toBe(FLAG_SHADOW);
    expect(getSearchPolicyFlag({ SEARCH_POLICY_ENGINE: "v1" })).toBe(FLAG_V1);
    expect(getSearchPolicyFlag({ SEARCH_POLICY_ENGINE: "banana" })).toBe(FLAG_OFF);
    expect(
      isOriginAllowed("atibaia-sp", {
        SEARCH_POLICY_ENGINE_CITIES: "braganca-paulista-sp, atibaia-sp",
      })
    ).toBe(true);
    expect(
      isOriginAllowed("extrema-mg", { SEARCH_POLICY_ENGINE_CITIES: "braganca-paulista-sp" })
    ).toBe(false);
    expect(isOriginAllowed(null, { SEARCH_POLICY_ENGINE_CITIES: "braganca-paulista-sp" })).toBe(
      false
    );
    expect(isOriginAllowed(null, { SEARCH_POLICY_ENGINE_CITIES: "*" })).toBe(true);
  });
});
