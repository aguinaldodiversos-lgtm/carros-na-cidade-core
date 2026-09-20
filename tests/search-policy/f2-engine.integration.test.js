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
//                  DEC-26: preço 79.000 MEDIA (+1) antes de câmbio GRANDE (+3).
//   B1  DEC-26     boundary real de preço e de distância, concessão até 150 km
//                  sobre candidato sintético a 148 km, e leveza (0 queries com
//                  o alvo atingido, exatamente 2 abaixo dele).
//   8.8 shadow     resposta legada intacta + 1 evento search.executed com old/new.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import {
  buildBoundaryQuery,
  computeRelaxations,
} from "../../src/modules/ads/search-policy/relaxations.js";
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
      // F2.2-B1: a Guided Relaxation passou a emitir DUAS queries (boundaries e
      // benefício). As duas precisam do mesmo guard de JOIN — foi a falta dele
      // que quebrou o countQuery em produção duas vezes.
      for (const [i, sql] of (relax.sqls || []).entries())
        assertAliasesJoined(sql, `${c.key} relaxações[${i}]`);
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
  // F2.2-A1: o território deixa de vir do perfil de produto. Atibaia tem 34
  // ativos próprios (≥ 20 do BROWSE_CITY), então o baseline de descoberta para
  // em 0 km e o modelo raro é procurado DENTRO dele — antes o SEARCH_MODEL
  // puxava sozinho o território até 150 km (DEC-10/11/18/23).
  // F2.2-B1 (DEC-26): o mesmo cenário sob a política certificada. Duas coisas
  // mudam de lugar em relação à F2 original, e as duas são a norma funcionando:
  //
  //   preço — o teto sai do ESTOQUE. O Onix automático mais barato acima de
  //           R$ 75.000 custa R$ 78.900; arredondado para cima ao quantum de
  //           R$ 1.000 dá R$ 79.000. A fórmula antiga dava R$ 87.000, um valor
  //           que nenhum anúncio justificava.
  //   ordem — a banda é categórica. `price` é MEDIA (+5,3%) e traz 1 resultado;
  //           `transmission` é GRANDE e traz 3. A concessão mais barata vence,
  //           embora renda menos: é exatamente a proibição da DEC-26 de que
  //           benefício maior compre banda maior.
  it("8.7 relaxações DEC-26: q=onix + automatico + 75000 em Atibaia → preço 79000 MEDIA (+1) antes de câmbio GRANDE (+3), sem radius", async () => {
    const r = await runSearchPolicyEngine(
      { origem: "atibaia-sp", q: "onix", transmission: "automatico", price_max: "75000" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(r.search_policy).toMatchObject({
      profile: "SEARCH_MODEL",
      total_result_count: 0,
      effective_radius_km: 0,
      required_distance_km: 0,
      reason: "LOCAL_LIQUIDITY_OK",
      location_source: "CITY_PAGE",
    });
    expect(r.relaxations.map((x) => x.dimension)).toEqual(["price", "transmission"]);
    expect(r.relaxations[0]).toMatchObject({
      dimension: "price",
      cost_band: "MEDIA",
      applied_value: 79000,
      url_params: { price_max: 79000 },
      delta_result_count: 1,
      label: "subir o teto para R$ 79 mil",
    });
    expect(r.relaxations[1]).toMatchObject({
      dimension: "transmission",
      cost_band: "GRANDE",
      delta_result_count: 3,
      url_params: { transmission: null },
    });
    // O degrau antigo (+15% = R$ 87.000) não pode reaparecer em lugar nenhum.
    expect(JSON.stringify(r.relaxations)).not.toContain("87000");
    // Nenhum candidato útil fora de Atibaia até 150 km para este produto.
    expect(r.relaxations.some((x) => x.dimension === "radius")).toBe(false);
    expect(r.chips.map((c) => c.key)).toEqual(["commercial_model", "price", "transmission", "geo"]);
    // Anéis: só os de rings_manual; 150 não aparece porque não é anel automático.
    expect(r.search_policy.rings.map((x) => x.radius_km)).toEqual([0, 25, 50, 75]);
    expect(r.search_policy.rings.some((x) => x.radius_km === 150)).toBe(false);
    expect(r.search_policy.rings[0]).toEqual({
      radius_km: 0,
      label: "Apenas Atibaia",
      count: 0,
      url_params: { raio: 0 },
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

  // ── F2.2-A2 — raio manual exato e concessão de 150 ─────────────────────────
  //
  // Distâncias REAIS da fixture a partir de Atibaia (region_memberships
  // construída pelo builder da F1 sobre as coordenadas de produção):
  //   Atibaia 0 · Bragança 18,34 · Vargem 29,52 · Jundiaí 35,69 ·
  //   Extrema 38,10 · Campinas 57,23 · Camanducaia 58,21 · Rio 344,21
  //
  // Essa malha é o que permite provar granularidade de 1 km sem inventar
  // fixture: 37 e 40 km separam Jundiaí de Extrema, coisa que nenhum preset
  // (0/25/50/75) consegue fazer.

  /** Distâncias do território real, lidas de region_memberships (fonte
   *  independente do motor). */
  async function distancesWithin(radiusKm) {
    const { rows } = await db.query(
      `SELECT rm.distance_km::float AS d
         FROM region_memberships rm
         JOIN cities c ON c.id = rm.base_city_id
        WHERE c.slug = 'atibaia-sp' AND rm.distance_km <= $1
        ORDER BY 1`,
      [radiusKm]
    );
    return rows.map((r) => Number(r.d));
  }

  /** Ativos dentro do raio, contados direto no banco — não pelo motor. */
  async function activeAdsWithin(radiusKm, extraSql = "") {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n
         FROM ads a
        WHERE a.status = 'active' ${extraSql}
          AND a.city_id IN (
            SELECT rm.member_city_id FROM region_memberships rm
            JOIN cities c ON c.id = rm.base_city_id
            WHERE c.slug = 'atibaia-sp' AND rm.distance_km <= $1)`,
      [radiusKm]
    );
    return Number(rows[0].n);
  }

  it("A2 raio=40 em Atibaia: MANUAL_RADIUS 40 exato, Extrema (38 km) dentro e Campinas (57 km) fora", async () => {
    const r = await runSearchPolicyEngine(
      { origem: "atibaia-sp", raio: "40" },
      { db, policy, cache: false, telemetry: false }
    );
    const sp = r.search_policy;
    expect(sp.geo_mode).toBe("MANUAL_RADIUS");
    expect(sp.requested_radius_km).toBe(40);
    expect(sp.effective_radius_km).toBe(40);
    expect(sp.user_geo_explicit).toBe(true);
    // 40 não é preset: nenhum arredondamento para 25 ou 50 (INV-006)
    expect(policy.rings_manual).not.toContain(40);
    expect(sp.required_distance_km).toBeNull();

    const slugs = sp.cities.map((c) => c.slug);
    expect(slugs).toContain("extrema-mg"); // 38,10 — e cruza UF
    expect(slugs).not.toContain("campinas-sp"); // 57,23
    expect(slugs).not.toContain("camanducaia-mg"); // 58,21
    for (const c of sp.cities) expect(c.distance_km).toBeLessThanOrEqual(40);

    // territory_city_count é o território, não só as cidades com estoque
    expect(sp.territory_city_count).toBe((await distancesWithin(40)).length);
    // e o grid concorda com uma contagem feita fora do motor
    expect(sp.total_result_count).toBe(await activeAdsWithin(40));
  });

  it("A2 granularidade de 1 km: raio=37 exclui Extrema (38,10) que raio=40 inclui", async () => {
    const r37 = await runSearchPolicyEngine(
      { origem: "atibaia-sp", raio: "37" },
      { db, policy, cache: false, telemetry: false }
    );
    const r40 = await runSearchPolicyEngine(
      { origem: "atibaia-sp", raio: "40" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(r37.search_policy.effective_radius_km).toBe(37);
    expect(r40.search_policy.effective_radius_km).toBe(40);
    // `cities` lista as cidades EMITIDAS (origem + as que têm estoque), não o
    // território inteiro: Jundiaí está a 35,69 km mas não tem anúncio ativo na
    // fixture, então nunca aparece aqui. Quem mede território é
    // `territory_city_count`.
    const s37 = r37.search_policy.cities.map((c) => c.slug);
    const s40 = r40.search_policy.cities.map((c) => c.slug);
    expect(s37).not.toContain("extrema-mg"); // 38,10 > 37
    expect(s40).toContain("extrema-mg"); // 38,10 <= 40
    expect(await distancesWithin(37)).not.toContain(38.1);
    expect(await distancesWithin(40)).toContain(38.1);
    // Se houvesse snap para presets, 37 e 40 cairiam no MESMO anel (50 km) e
    // dariam territórios idênticos.
    expect(r37.search_policy.territory_city_count).toBeLessThan(
      r40.search_policy.territory_city_count
    );
  });

  it("A2 raio=150: MANUAL_RADIUS 150, território até 150, sem AUTO e sem baseline", async () => {
    const r = await runSearchPolicyEngine(
      { origem: "atibaia-sp", raio: "150" },
      { db, policy, cache: false, telemetry: false }
    );
    const sp = r.search_policy;
    expect(sp.geo_mode).toBe("MANUAL_RADIUS");
    expect(sp.requested_radius_km).toBe(150);
    expect(sp.effective_radius_km).toBe(150);
    expect(sp.user_geo_explicit).toBe(true);
    expect(sp.reason).toBe("MANUAL");
    // AUTO não participou: `required_distance_km` é grandeza do automático
    expect(sp.required_distance_km).toBeNull();
    for (const c of sp.cities) expect(c.distance_km).toBeLessThanOrEqual(150);
    expect(sp.cities.map((c) => c.slug)).not.toContain("rio-de-janeiro-rj"); // 344,21
    // O território passou do teto automático de 75 sem que o AUTO o tenha
    // alcançado — as duas vias continuam separadas.
    expect(sp.territory_city_count).toBe((await distancesWithin(150)).length);
    expect(sp.total_result_count).toBe(await activeAdsWithin(150));
  });

  it("A2 raio=0 explícito: EXACT_CITY com automático bloqueado (INV-076)", async () => {
    const r = await runSearchPolicyEngine(
      {
        origem: "atibaia-sp",
        raio: "0",
        q: "onix",
        transmission: "automatico",
        price_max: "75000",
      },
      { db, policy, cache: false, telemetry: false }
    );
    expect(r.search_policy.geo_mode).toBe("EXACT_CITY");
    expect(r.search_policy.effective_radius_km).toBe(0);
    expect(r.search_policy.user_geo_explicit).toBe(true);
    expect(r.search_policy.expanded).toBe(false);
  });

  it("A2 produto + manual: SEARCH_MODEL com raio=40 respeita 40, não cai no baseline nem expande", async () => {
    const r = await runSearchPolicyEngine(
      { origem: "atibaia-sp", q: "onix", raio: "40" },
      { db, policy, cache: false, telemetry: false }
    );
    const sp = r.search_policy;
    expect(sp.profile).toBe("SEARCH_MODEL");
    expect(sp.geo_mode).toBe("MANUAL_RADIUS");
    expect(sp.effective_radius_km).toBe(40);
    // INV-078: o baseline territorial de /comprar não se aplica com raio
    // explícito — se aplicasse, o território seria o do BROWSE_CITY (0 km, já
    // que Atibaia satura o alvo sozinha) e não 40.
    expect(sp.effective_radius_km).not.toBe(0);
    expect(sp.required_distance_km).toBeNull();
    // O filtro de produto não mexeu no raio pedido (INV-009 continua válido na
    // outra direção: produto não expande, e aqui também não encolhe).
    expect(sp.total_result_count).toBe(
      await activeAdsWithin(40, "AND a.commercial_model ILIKE 'onix'")
    );
    // ranking e facetas saem do MESMO CandidateScope, com o 40 dentro dele
    const ctx = await buildSearchContext(
      { origem: "atibaia-sp", q: "onix", raio: "40" },
      { db, policy }
    );
    const scope = await resolveScope(ctx, policy, { db, cache: false });
    const q = buildEngineQueries(ctx, scope);
    expect(q.scopeCtx.territory.radiusKm).toBe(40);
    expect(q.dataQuery).toContain("distance_km <=");
    expect(q.params).toContain(40);
    expect(q.countParams).toContain(40);
    // o mesmo território alimenta as facetas
    expect(buildPassiveFacetsQuery(q.scopeCtx, policy, facetKeysFor(ctx.filters)).params).toContain(
      40
    );
  });

  // O teste A2 "concessão de 150 ponta a ponta" foi absorvido pelo caso B1 de
  // 150 km logo abaixo. Ele lia a oferta do CONSTRUTOR de variantes porque a
  // política de então montava o degrau de 150 mesmo sem candidato nenhum lá —
  // uma oferta de delta zero, que a DEC-26 proíbe construir. O caso B1 prova a
  // mesma propriedade da A2 (oferta → url_params → MANUAL_RADIUS 150, sem
  // reintroduzir 150 no automático) sobre um candidato REAL a 148 km.

  /**
   * Cidade + membership + anúncio ACTIVE sintéticos entre 75 e 150 km de
   * Atibaia, criados SÓ dentro deste banco descartável e removidos no fim.
   *
   * A fixture histórica não tem cidade útil nessa faixa (a mais próxima acima
   * de 75 km é o Rio, a 344 km), e a regra do teto de 150 não pode ser provada
   * por dedução: sem candidato real, o boundary é nulo e a concessão
   * simplesmente não existe — que é justamente o comportamento correto da
   * DEC-26. Para provar o outro lado é preciso um candidato real.
   */
  async function withSentinelCity({ distanceKm, ad }, fn) {
    const slug = `sentinela-b1-${String(distanceKm).replace(".", "-")}`;
    const adSlug = `sentinela-b1-ad-${String(distanceKm).replace(".", "-")}`;
    let cityId = null;
    try {
      const { rows: cityRows } = await db.query(
        `INSERT INTO cities (name, state, slug, latitude, longitude)
         VALUES ('Sentinela B1', 'MG', $1, -21.9000, -45.9000) RETURNING id`,
        [slug]
      );
      cityId = Number(cityRows[0].id);
      const { rows: base } = await db.query(`SELECT id FROM cities WHERE slug = 'atibaia-sp'`);
      const atibaiaId = Number(base[0].id);
      await db.query(
        `INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
         VALUES ($1, $2, $3, 3), ($2, $1, $3, 3), ($2, $2, 0, 0)`,
        [atibaiaId, cityId, distanceKm]
      );
      const { ids } = await fixture;
      await db.query(
        `INSERT INTO ads (advertiser_id, city_id, city, state, title, brand, model, commercial_model,
                          price, year, mileage, transmission, fuel_type, body_type, below_fipe,
                          plan, priority, status, slug, created_at, updated_at, images)
         VALUES ($1, $2, 'Sentinela B1', 'MG', $3, $4, $5, $6, $7, 2023, 40000, $8, 'flex', 'hatch',
                 false, 'free', 1, 'active', $9, NOW(), NOW(), '[]'::jsonb)`,
        [
          ids.advertisers.startExtrema,
          cityId,
          ad.title,
          ad.brand,
          ad.model,
          ad.commercialModel,
          ad.price,
          ad.transmission,
          adSlug,
        ]
      );
      return await fn({ cityId, slug });
    } finally {
      if (cityId !== null) {
        await db.query(`DELETE FROM ads WHERE city_id = $1`, [cityId]);
        await db.query(
          `DELETE FROM region_memberships WHERE base_city_id = $1 OR member_city_id = $1`,
          [cityId]
        );
        await db.query(`DELETE FROM cities WHERE id = $1`, [cityId]);
      }
    }
  }

  // ── F2.2-B1 — Guided Relaxation da DEC-26 em Postgres real ────────────────

  it("B1 price boundary: o teto vem do ESTOQUE (74.900 → 75.000), não de um degrau fixo", async () => {
    // Onix em Atibaia: 70.900 · 74.900 · 74.900 · 77.900 · 78.900 · 78.900.
    // Com teto 71.000 só o primeiro entra. O candidato imediatamente acima
    // custa 74.900 — arredondado para cima ao quantum de R$ 1.000, 75.000.
    const r = await runSearchPolicyEngine(
      { origem: "atibaia-sp", q: "onix", price_max: "71000" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(r.search_policy.total_result_count).toBe(1);
    const price = r.relaxations.find((x) => x.dimension === "price");
    expect(price).toBeDefined();
    expect(price.applied_value).toBe(75000);
    expect(price.url_params.price_max).toBe(75000);
    // o degrau antigo (+15% = 81.650 → 82.000) não existe mais
    expect(price.applied_value).not.toBe(82000);
    // banda pelo VALOR FINAL: (75000-71000)/71000 = +5,63% → MEDIA
    expect(price.cost_band).toBe("MEDIA");
    // delta real: passam a caber os dois de 74.900
    expect(price.delta_result_count).toBe(2);
    expect(price.delta_seller_count).toBe(0); // mesmo lojista
    expect(price.delta_city_count).toBe(0); // mesma cidade

    // O valor aplicado reentra no motor e produz exatamente o que prometeu.
    const applied = await runSearchPolicyEngine(
      { origem: "atibaia-sp", q: "onix", ...price.url_params },
      { db, policy, cache: false, telemetry: false }
    );
    expect(applied.search_policy.total_result_count).toBe(
      r.search_policy.total_result_count + price.delta_result_count
    );
  });

  it("B1 radius boundary cross-UF: Atibaia 25 km → candidato em Extrema a 38,10 → concessão 40 km PEQUENA", async () => {
    // Sentinela real da malha: Extrema-MG está a 38,10 km de Atibaia, e é a
    // primeira cidade com Gol fora do território de 25 km.
    const step1 = await runSearchPolicyEngine(
      { origem: "atibaia-sp", raio: "25", q: "gol" },
      { db, policy, cache: false, telemetry: false }
    );
    expect(step1.search_policy.effective_radius_km).toBe(25);
    expect(step1.search_policy.total_result_count).toBe(0);

    const radius = step1.relaxations.find((x) => x.dimension === "radius");
    expect(radius).toBeDefined();
    expect(radius.applied_value).toBe(40); // ceil(38,10 / 5) * 5
    expect(radius.url_params).toEqual({ raio: 40 });
    expect(radius.cost_band).toBe("PEQUENA"); // +15 km ≤ 25
    expect(radius.delta_result_count).toBeGreaterThanOrEqual(1);
    expect(radius.included_cities).toContain("extrema-mg");
    // 40 não é preset de rings_manual: a concessão não veio de anel nenhum.
    expect(policy.rings_manual.includes(40)).toBe(false);

    // Aceitar a concessão reentra como MANUAL_RADIUS exato e traz o resultado.
    const step2 = await runSearchPolicyEngine(
      { origem: "atibaia-sp", q: "gol", ...radius.url_params },
      { db, policy, cache: false, telemetry: false }
    );
    expect(step2.search_policy.geo_mode).toBe("MANUAL_RADIUS");
    expect(step2.search_policy.effective_radius_km).toBe(40);
    expect(step2.search_policy.total_result_count).toBe(radius.delta_result_count);
    expect(step2.data.map((x) => x.city_slug)).toContain("extrema-mg");
  });

  it("B1 concessão até 150 km: candidato real a 148 km vira oferta de 150 GRANDE, aceita como MANUAL_RADIUS", async () => {
    await withSentinelCity(
      {
        distanceKm: 148.0,
        ad: {
          title: "Onix Sentinela",
          brand: "GM - Chevrolet",
          model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
          commercialModel: "Onix",
          price: 69000,
          transmission: "automatico",
        },
      },
      async () => {
        const step1 = await runSearchPolicyEngine(
          {
            origem: "atibaia-sp",
            q: "onix",
            raio: "75",
            transmission: "automatico",
            price_max: "70000",
          },
          { db, policy, cache: false, telemetry: false }
        );
        expect(step1.search_policy.effective_radius_km).toBe(75);
        expect(step1.search_policy.total_result_count).toBe(0);

        const radius = step1.relaxations.find((x) => x.dimension === "radius");
        expect(radius).toBeDefined();
        expect(radius.applied_value).toBe(150); // ceil(148 / 5) * 5, dentro do teto
        expect(radius.url_params).toEqual({ raio: 150 });
        expect(radius.cost_band).toBe("GRANDE"); // +75 km > 50
        expect(radius.delta_result_count).toBe(1);
        expect(radius.delta_city_count).toBe(1);
        expect(radius.included_cities).toContain("sentinela-b1-148");

        // Etapa 2 — os url_params da oferta viram a query seguinte, sem tradução.
        const step2 = await runSearchPolicyEngine(
          {
            origem: "atibaia-sp",
            q: "onix",
            transmission: "automatico",
            price_max: "70000",
            ...radius.url_params,
          },
          { db, policy, cache: false, telemetry: false }
        );
        expect(step2.search_policy.geo_mode).toBe("MANUAL_RADIUS");
        expect(step2.search_policy.requested_radius_km).toBe(150);
        expect(step2.search_policy.effective_radius_km).toBe(150);
        expect(step2.search_policy.user_geo_explicit).toBe(true);
        expect(step2.search_policy.total_result_count).toBe(1);
        expect(step2.data[0].city_slug).toBe("sentinela-b1-148");

        // 150 continua PROIBIDO no automático: a mesma busca sem raio explícito
        // não chega lá sozinha (DEC-11/18/23 preservadas).
        const auto = await runSearchPolicyEngine(
          { origem: "atibaia-sp", q: "onix", transmission: "automatico", price_max: "70000" },
          { db, policy, cache: false, telemetry: false }
        );
        expect(auto.search_policy.geo_mode).toBe("AUTO_RADIUS");
        expect(auto.search_policy.effective_radius_km).toBeLessThanOrEqual(75);
        expect(auto.search_policy.rings.some((x) => x.radius_km === 150)).toBe(false);
      }
    );

    // a sentinela não sobreviveu ao teste
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM cities WHERE slug LIKE 'sentinela-b1-%'`
    );
    expect(rows[0].n).toBe(0);
  });

  it("B1 lazy: com o alvo atingido, a Guided Relaxation não executa NENHUMA query", async () => {
    const ctx = await buildSearchContext({ origem: "atibaia-sp" }, { db, policy });
    const scope = await resolveScope(ctx, policy, { db, cache: false });
    const q = buildEngineQueries(ctx, scope);
    const { rows } = await db.query(q.countQuery, q.countParams);
    const total = Number(rows[0].total);
    expect(total).toBeGreaterThanOrEqual(ctx.intent.target);

    const spy = { calls: [], query: (...args) => (spy.calls.push(args[0]), db.query(...args)) };
    const relax = await computeRelaxations(ctx, scope, total, policy, { db: spy, cache: false });
    expect(relax).toEqual({ relaxations: [], queries: 0 });
    expect(spy.calls).toEqual([]);

    // E abaixo do alvo, a MESMA origem dispara exatamente duas — nunca N+1,
    // nem uma por dimensão, nem uma por sugestão.
    const ctxLow = await buildSearchContext(
      {
        origem: "atibaia-sp",
        q: "onix",
        price_max: "71000",
        year_min: "2024",
        mileage_max: "30000",
      },
      { db, policy }
    );
    const scopeLow = await resolveScope(ctxLow, policy, { db, cache: false });
    const qLow = buildEngineQueries(ctxLow, scopeLow);
    const { rows: lowRows } = await db.query(qLow.countQuery, qLow.countParams);
    const spyLow = {
      calls: [],
      query: (...args) => (spyLow.calls.push(args[0]), db.query(...args)),
    };
    const relaxLow = await computeRelaxations(ctxLow, scopeLow, Number(lowRows[0].total), policy, {
      db: spyLow,
      cache: false,
    });
    expect(relaxLow.queries).toBe(2);
    expect(spyLow.calls).toHaveLength(2);
    expect(relaxLow.relaxations.length).toBeLessThanOrEqual(3);
  });

  it("B1 a investigação até 150 km só existe dentro da Guided Relaxation", async () => {
    // Nenhuma query do caminho normal (grid, count, facetas, liquidez) pode
    // carregar 150 como parâmetro; a de boundary, sim.
    const ctx = await buildSearchContext({ origem: "atibaia-sp", q: "onix" }, { db, policy });
    const scope = await resolveScope(ctx, policy, { db, cache: false });
    const q = buildEngineQueries(ctx, scope);
    expect(q.params).not.toContain(150);
    expect(q.countParams).not.toContain(150);
    const liq = await runLiquidityQuery(db, {
      originId: ctx.origin.id,
      radiusKm: ctx.intent.max_auto_radius,
      filters: ctx.filters,
    });
    expect(liq.params).not.toContain(150);
    expect(Number(ctx.intent.max_auto_radius)).toBeLessThanOrEqual(75);

    const boundary = buildBoundaryQuery(ctx, scope, policy);
    expect(boundary.params).toContain(150);
    expect(boundary.cap).toBe(150);
  });

  it("B1 migration 068: política persistida == SEARCH_POLICY_DEFAULT, idempotente e sem tocar chaves alheias", async () => {
    const sql = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/database/migrations/068_search_policy_guided_relaxation_dec26.sql"
      ),
      "utf8"
    );
    const read = async () =>
      (
        await db.query(
          `SELECT value, updated_at FROM platform_settings WHERE key = 'search_policy'`
        )
      ).rows[0];

    // 1. O banco migrado e a constante do código dizem a MESMA coisa.
    const persisted = await read();
    expect(persisted.value.relaxations).toEqual(JSON.parse(JSON.stringify(policy.relaxations)));
    expect(persisted.value.relaxations.steps).toBeUndefined();

    // 2. Reaplicar não muda nada — nem `updated_at`.
    const again = await db.query(sql);
    expect(again.rowCount).toBe(0);
    expect((await read()).updated_at).toEqual(persisted.updated_at);

    // 3. Um ajuste do admin em OUTRA chave sobrevive à migration.
    await db.query(
      `UPDATE platform_settings SET value = jsonb_set(value, '{facets,open_max}', '7'::jsonb, true) WHERE key = 'search_policy'`
    );
    // …e um `relaxations` antigo é substituído, não fundido.
    await db.query(
      `UPDATE platform_settings SET value = jsonb_set(value, '{relaxations}', '{"max_items":3,"steps":{"price_max":0.15}}'::jsonb, true) WHERE key = 'search_policy'`
    );
    const applied = await db.query(sql);
    expect(applied.rowCount).toBe(1);
    const after = await read();
    expect(after.value.facets.open_max).toBe(7); // ajuste alheio preservado
    expect(after.value.relaxations).toEqual(JSON.parse(JSON.stringify(policy.relaxations)));
    expect(after.value.relaxations.steps).toBeUndefined();
    expect(after.value.rings_auto).toEqual([0, 25, 50, 75]); // 067 preservada

    // restaura o estado que os demais testes esperam
    await db.query(
      `UPDATE platform_settings SET value = jsonb_set(value, '{facets,open_max}', '3'::jsonb, true) WHERE key = 'search_policy'`
    );
  });

  it("A2 não regride A1: sem raio explícito, nenhum perfil de produto chega a 150", async () => {
    for (const q of ["onix", "onix 2020", "chevrolet"]) {
      const r = await runSearchPolicyEngine(
        { origem: "atibaia-sp", q },
        { db, policy, cache: false, telemetry: false }
      );
      expect(r.search_policy.geo_mode).toBe("AUTO_RADIUS");
      expect(r.search_policy.effective_radius_km).toBeLessThanOrEqual(75);
      expect(r.search_policy.user_geo_explicit).toBe(false);
      expect(r.search_policy.rings.some((x) => x.radius_km === 150)).toBe(false);
    }
  });

  it("A2 raio inválido não vira manual nem arredonda (INV-077, comportamento atual)", async () => {
    for (const bad of ["-1", "151", "40.5", "abc"]) {
      const r = await runSearchPolicyEngine(
        { origem: "atibaia-sp", raio: bad },
        { db, policy, cache: false, telemetry: false }
      );
      expect(r.search_policy.geo_mode).toBe("AUTO_RADIUS");
      expect(r.search_policy.requested_radius_km).toBeNull();
      expect(r.search_policy.user_geo_explicit).toBe(false);
    }
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
