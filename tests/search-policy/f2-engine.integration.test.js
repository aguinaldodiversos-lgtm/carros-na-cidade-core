// tests/search-policy/f2-engine.integration.test.js
//
// F2 — testes de integração do motor em Postgres REAL (banco descartável com
// a fixture de tests/search-policy/helpers/f2-fixture.js):
//   8.1 paridade   COUNT(dataQuery sem LIMIT) == countQuery == Σ faceta seller_kind
//                  == rings[effective].count, nos 24 SearchContexts + teste
//                  estrutural: todo alias citado no WHERE tem JOIN em TODAS as
//                  queries (grid, count, facetas, liquidez, relaxações).
//   8.4 ranking    Destaque 20 km > Pró 0 km > Pró 20 km; Destaque expirado como
//                  plano; Spin Destaque fora de q=onix; página 2 ≠ página 1;
//                  sort=price_asc inalterado.
//   8.6 facetas    count 0 ausente; 1 opção ausente salvo ativa; Modelo "Onix (6)";
//                  self-excluding de Câmbio.
//   8.7 relaxações fixture Atibaia: q=onix + automatico + 75000 → total 0;
//                  transmission +3 e price_max 87000 +1; radius ausente; ordem.
//   8.8 shadow     resposta legada intacta + 1 evento search.executed com old/new.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withF2Fixture } from "./helpers/f2-fixture.js";
import { CONTEXTS } from "./helpers/contexts.js";
import {
  buildEngineQueries,
  buildSearchContext,
  findUnsupportedParams,
  runSearchPolicyEngine,
  runSearchPolicyEngineIfAllowed,
  runShadowComparison,
} from "../../src/modules/ads/search-policy/engine.js";
import {
  resolveScope,
  runLiquidityQuery,
} from "../../src/modules/ads/search-policy/scope-resolver.js";
import { buildCandidateScope } from "../../src/modules/ads/search-policy/candidate-scope.js";
import {
  buildPassiveFacetsQuery,
  facetKeysFor,
} from "../../src/modules/ads/search-policy/facets-policy.js";
import { computeRelaxations } from "../../src/modules/ads/search-policy/relaxations.js";
import { resetDictionariesForTests } from "../../src/modules/ads/search-policy/dictionaries.js";
import { __policyCacheTesting } from "../../src/modules/ads/search-policy/policy-cache.js";
import { sellerKindExpr } from "../../src/modules/ads/filters/ads-ranking.sql.js";
import { buildSortClause } from "../../src/modules/ads/filters/ads-filter.sort.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";

/** Todo alias citado em qualquer lugar do SQL (WHERE, FILTER, ORDER BY, SELECT)
 *  precisa de um FROM/JOIN correspondente em algum lugar do MESMO SQL — a
 *  query de relaxações é um único COUNT(*) FILTER (WHERE …) cujo WHERE vem
 *  antes do FROM, então a verificação não depende de posição. */
function aliasesMissingJoin(sql) {
  const used = new Set([...sql.matchAll(/\b(a|c|adv|u|sp|rm|m|cm|c2)\.[a-z_]/g)].map((m) => m[1]));
  const declared = new Set(
    [...sql.matchAll(/\b(?:FROM|JOIN)\s+[a-z_]+\s+(?:AS\s+)?([a-z0-9_]+)\b/gi)].map((m) => m[1])
  );
  return [...used].filter((alias) => !declared.has(alias));
}

function assertAliasesJoined(sql, label) {
  expect(aliasesMissingJoin(sql), `${label}: alias usado sem FROM/JOIN`).toEqual([]);
}

describe("helper assertAliasesJoined — prova de alcance (mutação)", () => {
  it("acusa alias sem JOIN e aceita SQL com FILTER (WHERE) antes do FROM", () => {
    expect(
      aliasesMissingJoin(
        "SELECT COUNT(*) FROM ads a JOIN cities c ON c.id = a.city_id WHERE u.id = 1"
      )
    ).toEqual(["u"]);
    expect(
      aliasesMissingJoin("SELECT COUNT(*) FILTER (WHERE a.price > 1) AS n FROM ads a")
    ).toEqual([]);
    expect(aliasesMissingJoin("SELECT 1 FROM ads a WHERE sp.slug = 'x' AND adv.id = 1")).toEqual([
      "sp",
      "adv",
    ]);
    expect(
      aliasesMissingJoin(
        "SELECT 1 FROM ads a LEFT JOIN subscription_plans sp ON sp.id = 1 WHERE sp.slug = 'x'"
      )
    ).toEqual([]);
  });
});

function stripLimit(dataQuery) {
  return dataQuery.replace(/\s*LIMIT \$\d+\s*OFFSET \$\d+\s*$/, "");
}

describe.sequential("F2 — motor em Postgres real", () => {
  let fixture;
  let db;
  let done;
  const policy = SEARCH_POLICY_DEFAULT;

  beforeAll(async () => {
    fixture = new Promise((resolve, reject) => {
      withF2Fixture("engine", async (f) => {
        resolve(f);
        await new Promise((r) => (done = r));
      }).catch(reject);
    });
    const f = await fixture;
    db = f.db;
    resetDictionariesForTests();
    __policyCacheTesting.reset();
  }, 300000);

  afterAll(async () => {
    if (done) done();
    await new Promise((r) => setTimeout(r, 100));
  });

  it("fixture: 34 ativos em Atibaia (33 + Spin), 2 em Bragança, 2 em Extrema, sentinelas presentes", async () => {
    const { rows } = await db.query(
      `SELECT c.slug, COUNT(*)::int AS n FROM ads a JOIN cities c ON c.id = a.city_id WHERE a.status='active' GROUP BY c.slug ORDER BY 1`
    );
    expect(Object.fromEntries(rows.map((r) => [r.slug, r.n]))).toEqual({
      "atibaia-sp": 35,
      "braganca-paulista-sp": 2,
      "extrema-mg": 2,
      "rio-de-janeiro-rj": 1,
    });
    const { rows: sent } = await db.query(
      `SELECT rm.distance_km::float AS km FROM region_memberships rm JOIN cities a ON a.id=rm.base_city_id JOIN cities b ON b.id=rm.member_city_id
       WHERE a.slug='braganca-paulista-sp' AND b.slug='extrema-mg'`
    );
    expect(Math.abs(sent[0].km - 25.4)).toBeLessThanOrEqual(0.5);
  });

  // ── 8.1 ────────────────────────────────────────────────────────────────────
  it("8.1 paridade em 24 contextos + JOINs estruturais nas 5 queries", async () => {
    for (const c of CONTEXTS) {
      const ctx = await buildSearchContext(c.query, { db, policy });
      const scope = await resolveScope(ctx, policy, { db, cache: false });
      const q = buildEngineQueries(ctx, scope);

      const gridCount = await db.query(
        `SELECT COUNT(*)::int AS n FROM (${stripLimit(q.dataQuery)}) x`,
        q.params.slice(0, -2)
      );
      const count = await db.query(q.countQuery, q.countParams);
      const scopeSql = buildCandidateScope(q.scopeCtx);
      const seller = await db.query(
        `SELECT ${sellerKindExpr} AS k, COUNT(*)::int AS n FROM ads a ${scopeSql.joins} ${scopeSql.whereClause} GROUP BY 1`,
        scopeSql.params
      );
      const sellerSum = seller.rows.reduce((s, r) => s + r.n, 0);
      const total = count.rows[0].total;
      const ring = scope.rings.find((r) => r.radius_km === scope.effective_radius_km);

      expect(gridCount.rows[0].n, `${c.key}: COUNT(grid) vs count`).toBe(total);
      expect(sellerSum, `${c.key}: Σ seller_kind vs count`).toBe(total);
      expect(ring, `${c.key}: anel efetivo ${scope.effective_radius_km}`).toBeDefined();
      expect(ring.count, `${c.key}: rings[effective].count vs count`).toBe(total);

      assertAliasesJoined(q.dataQuery, `${c.key} grid`);
      assertAliasesJoined(q.countQuery, `${c.key} count`);
      const facetsQ = buildPassiveFacetsQuery(q.scopeCtx, policy, facetKeysFor(ctx.filters));
      assertAliasesJoined(facetsQ.sql, `${c.key} facets`);
      const liq = await runLiquidityQuery(db, {
        originId: ctx.origin.id,
        radiusKm: ctx.intent.max_auto_radius,
        filters: ctx.filters,
      });
      assertAliasesJoined(liq.sql, `${c.key} liquidez`);
      const relax = await computeRelaxations(ctx, scope, total, policy, { db, cache: false });
      if (relax.sql) assertAliasesJoined(relax.sql, `${c.key} relaxações`);
    }
  }, 120000);

  // ── 8.4 ────────────────────────────────────────────────────────────────────
  it("8.4 ranking a partir de Bragança: Destaque 18 km > Pró 0 km > Pró 18 km; expirado como plano", async () => {
    const { ids } = await fixture;
    const r = await runSearchPolicyEngine(
      { city_slug: "braganca-paulista-sp", limit: "50" },
      { db, policy, cache: false, telemetry: false }
    );
    const order = r.data.map((a) => a.id);
    expect(r.search_policy.effective_radius_km).toBe(25);
    expect(order[0]).toBe(ids.ads.spinDestaque); // Destaque a 18 km antes de tudo
    expect(order[1]).toBe(ids.ads.proBraganca); // Pró a 0 km antes dos Pró de Atibaia
    const firstAtibaiaPro = order.findIndex(
      (id) => ids.ads.onix.includes(id) || ids.ads.atibaiaOthers.includes(id)
    );
    expect(firstAtibaiaPro).toBeGreaterThan(1);
    // Destaque expirado ordena como Pró (peso 3): está entre os Pró, não no topo.
    const idxExpired = order.indexOf(ids.ads.argoExpirado);
    expect(idxExpired).toBeGreaterThan(1);
    expect(r.data[idxExpired].explain.tier_label).toBe("Pró");
    expect(r.data[0].explain).toMatchObject({
      tier_label: "Destaque",
      city_name: "Atibaia",
      distance_km: 18.34,
    });
    expect(r.data[1].explain).toMatchObject({
      tier_label: "Pró",
      city_name: "Bragança Paulista",
      distance_km: 0,
    });
    // O particular de Bragança (Grátis) vem depois de todos os Pró, inclusive os de Atibaia.
    expect(order.indexOf(ids.ads.pfBraganca)).toBeGreaterThan(order.lastIndexOf(ids.ads.onix[0]));
  });

  it("8.4 Spin Destaque não aparece em busca 'onix'; página 2 não repete página 1; price_asc inalterado", async () => {
    const { ids } = await fixture;
    const onix = await runSearchPolicyEngine(
      { city_slug: "braganca-paulista-sp", q: "onix", limit: "50" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(onix.data.map((a) => a.id)).not.toContain(ids.ads.spinDestaque);
    expect(onix.data.every((a) => a.commercial_model === "Onix")).toBe(true);
    expect(onix.pagination.total).toBe(6);

    const p1 = await runSearchPolicyEngine(
      { city_slug: "braganca-paulista-sp", limit: "10", page: "1" },
      { db, policy, cache: false, telemetry: false }
    );
    const p2 = await runSearchPolicyEngine(
      { city_slug: "braganca-paulista-sp", limit: "10", page: "2" },
      { db, policy, cache: false, telemetry: false }
    );
    const s1 = new Set(p1.data.map((a) => a.id));
    expect(p2.data.length).toBe(10);
    expect(p2.data.some((a) => s1.has(a.id))).toBe(false);

    const asc = await runSearchPolicyEngine(
      { city_slug: "braganca-paulista-sp", sort: "price_asc", limit: "50" },
      { db, policy, cache: false, telemetry: false }
    );
    const prices = asc.data.map((a) => Number(a.price));
    expect([...prices].sort((x, y) => x - y)).toEqual(prices);
    const ctx = await buildSearchContext(
      { city_slug: "braganca-paulista-sp", sort: "price_asc" },
      { db, policy }
    );
    const scope = await resolveScope(ctx, policy, { db, cache: false });
    const q = buildEngineQueries(ctx, scope);
    expect(q.dataQuery.replace(/\s+/g, " ")).toContain(
      `ORDER BY ${buildSortClause("price_asc").replace(/\s+/g, " ")}`
    );
  });

  // ── 8.6 ────────────────────────────────────────────────────────────────────
  it("8.6 facetas em Atibaia: Modelo mostra Onix (6); sem count 0; sem faceta de 1 opção; self-excluding de Câmbio", async () => {
    const r = await runSearchPolicyEngine(
      { city_slug: "atibaia-sp", raio: "0" },
      { db, policy, cache: false, telemetry: false }
    );
    const modelo = r.facets.find((f) => f.key === "commercial_model");
    expect(modelo.options.find((o) => o.value === "Onix")).toMatchObject({
      label: "Onix",
      count: 6,
    });
    for (const f of r.facets)
      for (const o of f.options) expect(o.count > 0 || o.active === true).toBe(true);
    for (const f of r.facets)
      if (f.active_value === null) expect(f.options.length).toBeGreaterThanOrEqual(2);
    expect(r.facets.find((f) => f.key === "version")).toBeUndefined();
    const open = r.facets.filter((f) => f.open).map((f) => f.key);
    expect(open).toContain("price");
    expect(open.length).toBe(3);

    const auto = await runSearchPolicyEngine(
      { city_slug: "atibaia-sp", raio: "0", transmission: "automatico" },
      { db, policy, cache: false, telemetry: false }
    );
    const cambio = auto.facets.find((f) => f.key === "transmission");
    expect(cambio.open).toBe(true);
    expect(cambio.options.map((o) => o.value).sort()).toEqual(["automatico", "manual"]);
    expect(cambio.options.find((o) => o.value === "automatico").active).toBe(true);
    expect(cambio.options.find((o) => o.value === "manual").count).toBeGreaterThan(0);
    // Versão só com modelo selecionado, em "Mais filtros".
    const onix = await runSearchPolicyEngine(
      { city_slug: "atibaia-sp", raio: "0", commercial_model: "Onix" },
      { db, policy, cache: false, telemetry: false }
    );
    const versao = onix.facets.find((f) => f.key === "version");
    expect(versao).toBeDefined();
    expect(versao.open).toBe(false);
    expect(versao.options.reduce((s, o) => s + o.count, 0)).toBe(6);
  });

  // ── 8.7 ────────────────────────────────────────────────────────────────────
  it("8.7 relaxações: q=onix + automatico + 75000 em Atibaia → total 0, transmission +3, price_max 87000 +1, sem radius", async () => {
    const r = await runSearchPolicyEngine(
      { origem: "atibaia-sp", q: "onix", transmission: "automatico", price_max: "75000" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(r.search_policy).toMatchObject({
      profile: "SEARCH_MODEL",
      total_result_count: 0,
      effective_radius_km: 150,
      reason: "AUTO_RADIUS_CAP_REACHED",
      location_source: "CITY_PAGE",
    });
    expect(r.relaxations).toEqual([
      {
        dimension: "transmission",
        label: "aceitar câmbio manual",
        delta: 3,
        url_params: { transmission: null },
      },
      {
        dimension: "price_max",
        label: "subir o teto para R$ 87 mil",
        delta: 1,
        url_params: { price_max: 87000 },
      },
    ]);
    expect(r.chips.map((c) => c.key)).toEqual(["commercial_model", "price", "transmission", "geo"]);
    expect(r.search_policy.rings[r.search_policy.rings.length - 1]).toEqual({
      radius_km: 150,
      label: "150 km",
      count: 0,
      auto: true,
    });
  });

  it("8.7 acima do target não há relaxação; E3: cities só origem + count>0 e territory_city_count", async () => {
    const r = await runSearchPolicyEngine(
      { city_slug: "braganca-paulista-sp" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(r.relaxations).toEqual([]);
    expect(r.search_policy.cities.map((c) => c.slug)).toEqual([
      "braganca-paulista-sp",
      "atibaia-sp",
    ]);
    expect(r.search_policy.territory_city_count).toBeGreaterThan(2);
    expect(r.search_policy.local_result_count).toBe(2);
  });

  // ── 8.8 shadow ─────────────────────────────────────────────────────────────
  it("8.8 shadow: telemetria com old/new gravada em analytics_events, resposta legada intocada", async () => {
    const legacy = { pagination: { total: 34 }, data: [{ id: 999 }] };
    const before = JSON.stringify(legacy);
    const out = await runShadowComparison({ city_slug: "braganca-paulista-sp" }, legacy, {
      db,
      policy,
      cache: false,
      path: "/api/ads/search?city_slug=braganca-paulista-sp",
    });
    expect(JSON.stringify(legacy)).toBe(before);
    expect(out.timedOut).toBe(false);
    expect(out.old_count).toBe(34);
    expect(out.new_count).toBe(37); // Bragança 2 + Atibaia 35 no anel de 25 km
    const { rows } = await db.query(
      `SELECT event_type, city_slug, payload FROM analytics_events WHERE event_type = 'search.executed'`
    );
    expect(rows.length).toBe(1);
    expect(rows[0].city_slug).toBe("braganca-paulista-sp");
    expect(rows[0].payload).toMatchObject({
      flag_mode: "shadow",
      old_count: 34,
      old_first_ad_id: 999,
      new_count: 37,
      profile: "BROWSE_CITY",
      geo_mode: "AUTO_RADIUS",
      effective_radius: 25,
    });
  });

  it("state= legado sem origem filtra por UF como o legado (STATE): RJ=1, MG=2, SP=37, sem state=40", async () => {
    const totals = {};
    for (const [label, q] of [
      ["rj", { state: "RJ" }],
      ["mg", { state: "MG" }],
      ["sp", { state: "SP", limit: "8", sort: "recent" }],
      ["all", {}],
    ]) {
      const r = await runSearchPolicyEngine(q, { db, policy, cache: false, telemetry: false });
      totals[label] = r.pagination.total;
      expect(r.search_policy.geo_mode).toBe(q.state ? "STATE" : "NATIONAL");
    }
    expect(totals).toEqual({ rj: 1, mg: 2, sp: 37, all: 40 });
  });

  // ── §4.9 — só assume o que modela ────────────────────────────────────────
  it("chaves legadas não modeladas: v1 recua ao legado SEM tocar o banco; shadow grava skipped", async () => {
    const dbThatThrows = {
      query: async () => {
        throw new Error("o motor não podia consultar o banco");
      },
    };
    for (const q of [
      { highlight_only: "true", limit: "12", sort: "highlight" },
      { model: "ONIX LTZ 1.0", city_slug: "atibaia-sp" },
      { state: "SP", city_slugs: "braganca-paulista-sp,vargem-sp,atibaia-sp" },
      { city: "Atibaia", state: "SP" },
    ]) {
      expect(findUnsupportedParams(q).length, JSON.stringify(q)).toBeGreaterThan(0);
      await expect(runSearchPolicyEngineIfAllowed(q, { db: dbThatThrows })).resolves.toBeNull();
    }
    expect(
      findUnsupportedParams({ city_slug: "atibaia-sp", city_slugs: "atibaia-sp", q: "onix" })
    ).toEqual([]);

    const legacy = { pagination: { total: 0 }, data: [] };
    const out = await runShadowComparison({ highlight_only: "true", sort: "highlight" }, legacy, {
      db,
      policy,
      cache: false,
      path: "/api/ads/search?highlight_only=true",
    });
    expect(out).toMatchObject({
      skipped: true,
      unsupported_params: ["highlight_only"],
      old_count: 0,
      new_count: null,
      timedOut: false,
    });
    const { rows } = await db.query(
      "SELECT payload FROM analytics_events WHERE event_type = 'search.executed' AND path = '/api/ads/search?highlight_only=true'"
    );
    expect(rows.length).toBe(1);
    expect(rows[0].payload).toMatchObject({
      flag_mode: "shadow",
      skipped: "unsupported_params",
      unsupported_params: ["highlight_only"],
      old_count: 0,
      new_count: null,
    });
  });

  it("cross-UF: a partir de Extrema-MG o motor enxerga Atibaia (38 km) e Bragança (25 km)", async () => {
    const r = await runSearchPolicyEngine(
      { city_slug: "extrema-mg" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(r.search_policy.cities.map((c) => c.slug)).toEqual([
      "extrema-mg",
      "braganca-paulista-sp",
      "atibaia-sp",
    ]);
    expect(r.search_policy.effective_radius_km).toBe(50);
    expect(r.pagination.total).toBe(39);
  });
});
