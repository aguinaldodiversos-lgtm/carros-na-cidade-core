// tests/search-policy/inv052-search-executed.integration.test.js
//
// F2.2-D1R — V3-INV-052 / DEC-27: `search.executed` é evento DE BUSCA com
// payload mínimo de 11 grandezas. Aqui se prova o que faltava:
//
//   commercial_model  vem do SearchContext já resolvido (estruturado ou texto),
//                     null quando ausente, nunca do primeiro anúncio.
//   seller_count      COUNT(DISTINCT advertiser_id) na MESMA query de total:
//                     mesmo CandidateScope/território/filtros, antes da
//                     paginação, neutro ao peso comercial, sem vir da relaxação,
//                     sem round-trip a mais.
//   commercial_weight / distance / position  ausentes do payload.
//
// Estoque próprio (modelos `*052`) sobre a fixture da F2, para que os números
// sejam controlados e não dependam do espelho de produção.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withF2Fixture } from "./helpers/f2-fixture.js";
import {
  buildSearchContext,
  runSearchPolicyEngine,
  runShadowComparison,
  __shadowTesting,
} from "../../src/modules/ads/search-policy/engine.js";
import {
  buildSearchExecutedPayload,
  __resetTelemetryForTests,
} from "../../src/modules/ads/search-policy/telemetry.js";
import { resetDictionariesForTests } from "../../src/modules/ads/search-policy/dictionaries.js";
import { __policyCacheTesting } from "../../src/modules/ads/search-policy/policy-cache.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";

/** As 11 grandezas de V3-INV-052, com os nomes concretos do contrato existente. */
const INV052_KEYS = [
  "q",
  "commercial_model",
  "specificity",
  "origin_city",
  "location_source",
  "geo_mode",
  "requested_radius",
  "effective_radius",
  "total_count",
  "seller_count",
  "policy_version",
];
const RESULT_SCOPED_KEYS = ["commercial_weight", "distance", "position"];
// Substitutos proibidos (DEC-27 "Sem agregados inventados"). `required_distance`
// é grandeza de busca (DEC-20) e não casa: exige prefixo de agregado/1º resultado.
const AGGREGATE_SUBSTITUTE_RE =
  /^(avg|average|mean|median|max|min|first|first_result|top)_.*(distance|weight|position)/i;

function assertInv052Shape(payload) {
  for (const k of INV052_KEYS) expect(payload, `falta ${k}`).toHaveProperty(k);
  for (const k of RESULT_SCOPED_KEYS) expect(payload, `sobrou ${k}`).not.toHaveProperty(k);
  expect(Object.keys(payload).filter((k) => AGGREGATE_SUBSTITUTE_RE.test(k))).toEqual([]);
}

/** Pool que registra todo statement (inclusive os de client do shadow). */
function recordingDb(pool) {
  const log = [];
  const rec = (text) => log.push(typeof text === "string" ? text : String(text?.text || ""));
  return {
    log,
    query(text, params) {
      rec(text);
      return pool.query(text, params);
    },
    async connect() {
      const client = await pool.connect();
      return {
        query(text, params) {
          rec(text);
          return client.query(text, params);
        },
        release: (err) => client.release(err),
      };
    },
  };
}

// No caminho normal o INSERT de telemetria é fire-and-forget, mas o db.query é
// chamado de forma síncrona: ao resolver o motor, o payload já foi capturado.
function capturingDb(pool) {
  const base = recordingDb(pool);
  const inserts = [];
  const query = base.query.bind(base);
  base.query = (text, params) => {
    if (typeof text === "string" && text.includes("INSERT INTO analytics_events")) {
      inserts.push(JSON.parse(params.at(-1)));
    }
    return query(text, params);
  };
  base.inserts = inserts;
  return base;
}

const sellerCountStatements = (log) => log.filter((t) => /AS seller_count/.test(t));

describe.sequential("F2.2-D1R — V3-INV-052 search.executed (Postgres real)", () => {
  let db;
  let done;
  let ids;
  const sellers = [];
  const policy = SEARCH_POLICY_DEFAULT;
  const adIds = {};

  beforeAll(async () => {
    const fixture = new Promise((resolve, reject) => {
      withF2Fixture("inv052", async (f) => {
        resolve(f);
        await new Promise((r) => (done = r));
      }).catch(reject);
    });
    const f = await fixture;
    db = f.db;
    ids = f.ids;
    resetDictionariesForTests();
    __policyCacheTesting.reset();
    __resetTelemetryForTests();
    __shadowTesting.reset();

    const cityName = {
      "atibaia-sp": ["Atibaia", "SP"],
      "extrema-mg": ["Extrema", "MG"],
      "rio-de-janeiro-rj": ["Rio de Janeiro", "RJ"],
    };
    for (let i = 1; i <= 7; i++) {
      const { rows } = await db.query(
        `INSERT INTO advertisers (user_id, city_id, name, slug, company_name) VALUES ($1,$2,$3,$4,$3) RETURNING id`,
        [ids.users.pro, ids.cities["atibaia-sp"], `Vendedor 052-${i}`, `adv-inv052-${i}`]
      );
      sellers.push(Number(rows[0].id));
    }
    let n = 0;
    async function ad(model, sellerIdx, citySlug = "atibaia-sp", price = 60000) {
      n += 1;
      const [name, state] = cityName[citySlug];
      const { rows } = await db.query(
        `INSERT INTO ads (advertiser_id, city_id, city, state, title, brand, model, commercial_model,
                          price, year, mileage, transmission, fuel_type, body_type,
                          plan, priority, status, slug, created_at, updated_at, images)
         VALUES ($1,$2,$3,$4,$5,'Marca052',$6,$7,$8,2022,40000,'manual','flex','hatch',
                 'free',1,'active',$9,$10,$10,'[]'::jsonb)
         RETURNING id`,
        [
          sellers[sellerIdx],
          ids.cities[citySlug],
          name,
          state,
          `${model} ${n}`,
          `${model.toUpperCase()} 1.0 FIPE DESC ${n}`,
          model,
          price,
          `inv052-${model.toLowerCase()}-${n}`,
          new Date(Date.UTC(2026, 7, 1, 12) + n * 3600_000).toISOString(),
        ]
      );
      const id = Number(rows[0].id);
      (adIds[model] ||= []).push(id);
      return id;
    }
    // SC2 — 3 anúncios, 1 vendedor.
    for (let i = 0; i < 3; i++) await ad("Mono052", 0);
    // SC3/SC7 — 3 anúncios, 3 vendedores.
    for (let i = 0; i < 3; i++) await ad("Tri052", i);
    // SC4 — 20 anúncios, 7 vendedores.
    for (let i = 0; i < 20; i++) await ad("Pag052", i % 7);
    // SC5 — 2 em Atibaia (vendedor 0), 1 em Extrema a 38 km (vendedor 1), 1 no Rio (vendedor 2).
    await ad("Terr052", 0);
    await ad("Terr052", 0);
    await ad("Terr052", 1, "extrema-mg");
    await ad("Terr052", 2, "rio-de-janeiro-rj");
    // SC6/SC8 — vendedor 0 a R$ 50 mil, vendedor 1 a R$ 150 mil.
    await ad("Filt052", 0, "atibaia-sp", 50000);
    await ad("Filt052", 1, "atibaia-sp", 150000);
  }, 300000);

  afterAll(async () => {
    if (done) done();
    await new Promise((r) => setTimeout(r, 100));
  });

  async function runNormal(query, path) {
    const rdb = capturingDb(db);
    const response = await runSearchPolicyEngine(query, { db: rdb, policy, cache: false, path });
    expect(rdb.inserts.length, "um search.executed por busca").toBe(1);
    return { response, payload: rdb.inserts[0], log: rdb.log };
  }

  const inAtibaia = (extra = {}) => ({ origem: "atibaia-sp", raio: "0", ...extra });

  // ── seller_count ──────────────────────────────────────────────────────────
  it("SC1 zero: sem anúncio elegível → total_count 0 e seller_count 0", async () => {
    const { payload } = await runNormal(inAtibaia({ commercial_model: "Nenhum052" }), "/sc1");
    expect(payload.total_count).toBe(0);
    expect(payload.seller_count).toBe(0);
  });

  it("SC2 um vendedor, 3 anúncios → 3 / 1", async () => {
    const { payload } = await runNormal(inAtibaia({ commercial_model: "Mono052" }), "/sc2");
    expect(payload.total_count).toBe(3);
    expect(payload.seller_count).toBe(1);
  });

  it("SC3 três vendedores distintos → 3 / 3", async () => {
    const { payload } = await runNormal(inAtibaia({ commercial_model: "Tri052" }), "/sc3");
    expect(payload.total_count).toBe(3);
    expect(payload.seller_count).toBe(3);
  });

  it("SC4 paginação não interfere: 20 / 7 em todas as páginas de 5", async () => {
    const seen = new Set();
    for (let page = 1; page <= 4; page++) {
      const { payload, response } = await runNormal(
        inAtibaia({ commercial_model: "Pag052", limit: "5", page: String(page) }),
        `/sc4?page=${page}`
      );
      expect(response.data.length).toBe(5);
      response.data.forEach((it) => seen.add(it.id));
      expect(payload.total_count).toBe(20);
      expect(payload.seller_count).toBe(7);
    }
    // Oráculo independente: os 20 ids servidos, somados página a página.
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT advertiser_id)::int AS n FROM ads WHERE id = ANY($1::bigint[])`,
      [[...seen]]
    );
    expect(seen.size).toBe(20);
    expect(rows[0].n).toBe(7);
  });

  it("SC5 território: fora do território efetivo não conta (Extrema só em 50 km; Rio nunca)", async () => {
    const exact = await runNormal(inAtibaia({ commercial_model: "Terr052" }), "/sc5-0");
    expect(exact.payload.effective_radius).toBe(0);
    expect(exact.payload.total_count).toBe(2);
    expect(exact.payload.seller_count).toBe(1);

    const r50 = await runNormal(inAtibaia({ commercial_model: "Terr052", raio: "50" }), "/sc5-50");
    expect(r50.payload.effective_radius).toBe(50);
    expect(r50.payload.total_count).toBe(3);
    expect(r50.payload.seller_count).toBe(2);
  });

  it("SC6 filtros: vendedor cujo único anúncio sai pelo filtro de preço não conta", async () => {
    const all = await runNormal(inAtibaia({ commercial_model: "Filt052" }), "/sc6-all");
    expect(all.payload.seller_count).toBe(2);
    const cut = await runNormal(
      inAtibaia({ commercial_model: "Filt052", price_max: "100000" }),
      "/sc6-cut"
    );
    expect(cut.payload.total_count).toBe(1);
    expect(cut.payload.seller_count).toBe(1);
  });

  it("SC7 peso comercial neutro: Destaque muda a ordem, não muda seller_count", async () => {
    const before = await runNormal(inAtibaia({ commercial_model: "Tri052" }), "/sc7-before");
    // A listagem serializa id como string.
    const firstBefore = String(before.response.data[0].id);
    const promoted = String(adIds.Tri052.find((id) => String(id) !== firstBefore));
    await db.query(`UPDATE ads SET highlight_until = NOW() + INTERVAL '1 day' WHERE id = $1`, [
      promoted,
    ]);
    try {
      const after = await runNormal(inAtibaia({ commercial_model: "Tri052" }), "/sc7-after");
      expect(String(after.response.data[0].id)).toBe(promoted); // o peso mudou de fato
      expect(after.payload.total_count).toBe(before.payload.total_count);
      expect(after.payload.seller_count).toBe(before.payload.seller_count);
      expect(after.payload.seller_count).toBe(3);
    } finally {
      await db.query(`UPDATE ads SET highlight_until = NULL WHERE id = $1`, [promoted]);
    }
  });

  it("SC8 relaxação neutra: seller_count vem da contagem da busca, com ou sem relaxação", async () => {
    // Abaixo do alvo → Guided Relaxation roda e oferece o vendedor de R$ 150 mil,
    // que NÃO entra no seller_count da busca corrente.
    const relaxed = await runNormal(
      inAtibaia({ commercial_model: "Filt052", price_max: "100000" }),
      "/sc8-relax"
    );
    expect(relaxed.response.relaxations.length).toBeGreaterThan(0);
    expect(relaxed.log.some((t) => /cur_sellers/.test(t))).toBe(true);
    expect(relaxed.payload.seller_count).toBe(1);

    // Acima do alvo (20 ≥ 12) → nenhuma query de relaxação, e seller_count existe.
    const noRelax = await runNormal(inAtibaia({ commercial_model: "Pag052" }), "/sc8-none");
    expect(noRelax.response.relaxations).toEqual([]);
    expect(noRelax.log.some((t) => /cur_sellers/.test(t))).toBe(false);
    expect(noRelax.payload.seller_count).toBe(7);
  });

  // ── round-trip ────────────────────────────────────────────────────────────
  it("seller_count sai da MESMA query de total — um único statement, sem LIMIT", async () => {
    const { log, payload } = await runNormal(inAtibaia({ commercial_model: "Pag052" }), "/rt");
    const statements = log.filter((t) => !t.includes("INSERT INTO analytics_events"));
    console.info(`[inv052] statements por busca (normal v1, sem relaxação) = ${statements.length}`);
    const sc = sellerCountStatements(statements);
    expect(sc.length).toBe(1);
    expect(sc[0]).toMatch(/COUNT\(\*\)::int AS total/);
    expect(sc[0]).toMatch(/COUNT\(DISTINCT a\.advertiser_id\)::int AS seller_count/);
    expect(sc[0]).not.toMatch(/\bLIMIT\b|\bOFFSET\b/);
    expect(payload.seller_count).toBe(7);
  });

  // ── commercial_model ──────────────────────────────────────────────────────
  it("CM1 estruturado: commercial_model=Mono052 → payload Mono052", async () => {
    const { payload } = await runNormal(inAtibaia({ commercial_model: "Mono052" }), "/cm1");
    expect(payload.commercial_model).toBe("Mono052");
  });

  it("CM2 texto resolvido: q=onix → SearchContext Onix → payload Onix", async () => {
    const query = inAtibaia({ q: "onix" });
    const ctx = await buildSearchContext(query, { db, policy });
    expect(ctx.filters.commercial_model).toBe("Onix");
    const { payload } = await runNormal(query, "/cm2");
    expect(payload.commercial_model).toBe("Onix");
  });

  it("CM2' a telemetria não resolve de novo: usa o que está no contexto", () => {
    const base = { intent: null, origin: null };
    expect(
      buildSearchExecutedPayload({ ctx: { ...base, rawQ: "onix", filters: {} } }).commercial_model
    ).toBeNull();
    expect(
      buildSearchExecutedPayload({
        ctx: { ...base, rawQ: "gol", filters: { commercial_model: "Onix" } },
      }).commercial_model
    ).toBe("Onix");
  });

  it("CM3 ausente: SearchContext sem modelo → null", () => {
    const p = buildSearchExecutedPayload({
      ctx: { rawQ: null, filters: {}, intent: null, origin: null },
    });
    expect(p.commercial_model).toBeNull();
  });

  it("CM4 não usa o primeiro resultado: contexto sem modelo, 1º anúncio com modelo → null", async () => {
    const { payload, response } = await runNormal(inAtibaia(), "/cm4");
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data[0].commercial_model).toBeTruthy(); // o atalho proibido existiria
    expect(payload.commercial_model).toBeNull();
  });

  // ── payload / schema ──────────────────────────────────────────────────────
  it("payload normal v1: 11 grandezas presentes, campos por resultado ausentes", async () => {
    const { payload } = await runNormal(inAtibaia({ commercial_model: "Tri052" }), "/schema");
    assertInv052Shape(payload);
    expect(payload).toMatchObject({
      commercial_model: "Tri052",
      origin_city: "atibaia-sp",
      geo_mode: "EXACT_CITY",
      requested_radius: 0,
      effective_radius: 0,
      total_count: 3,
      seller_count: 3,
      policy_version: policy.version,
    });
  });

  it("payload normal v1 é o que vai para analytics_events", async () => {
    await runNormal(inAtibaia({ commercial_model: "Mono052" }), "/persisted-normal");
    let rows = [];
    for (let i = 0; i < 50 && rows.length === 0; i++) {
      ({ rows } = await db.query(`SELECT payload FROM analytics_events WHERE path = $1`, [
        "/persisted-normal",
      ]));
      if (rows.length === 0) await new Promise((r) => setTimeout(r, 20));
    }
    expect(rows.length).toBe(1);
    assertInv052Shape(rows[0].payload);
    expect(rows[0].payload).toMatchObject({ commercial_model: "Mono052", seller_count: 1 });
  });

  // ── shadow ────────────────────────────────────────────────────────────────
  it("shadow: mesma semântica — commercial_model do contexto e seller_count pré-paginação", async () => {
    const legacy = { pagination: { total: 99 }, data: [{ id: 1 }] };
    const rdb = recordingDb(db);
    const out = await runShadowComparison(inAtibaia({ commercial_model: "Pag052" }), legacy, {
      db: rdb,
      policy,
      cache: false,
      path: "/shadow-inv052",
      timeoutMs: 5000,
    });
    expect(out.timedOut).toBe(false);
    expect(out.new_count).toBe(20);
    const { rows } = await db.query(`SELECT payload FROM analytics_events WHERE path = $1`, [
      "/shadow-inv052",
    ]);
    expect(rows.length).toBe(1);
    const payload = rows[0].payload;
    assertInv052Shape(payload);
    expect(payload).toMatchObject({
      flag_mode: "shadow",
      commercial_model: "Pag052",
      total_count: 20,
      seller_count: 7, // o shadow pagina com limit 1: 7 prova pré-paginação
    });
    const sc = sellerCountStatements(rdb.log);
    expect(sc.length).toBe(1);
    expect(sc[0]).toMatch(/COUNT\(\*\)::int AS total/);
    // BEGIN+SET LOCAL é um statement de setup; a comparação em si é UMA query
    // que contém summary + first_match. Não pode reaparecer o antigo par
    // countQuery + dataQuery serializado na mesma conexão.
    const comparisonStatements = rdb.log.filter(
      (t) => /WITH summary AS/.test(t) && /first_match AS/.test(t)
    );
    expect(comparisonStatements).toHaveLength(1);
  });

  // ── F2.2-D1R-S — shadow pulado ────────────────────────────────────────────
  it("T2/T3/T5 shadow pulado: nenhum SQL, nenhum search.executed (nem null, nem zero), diagnóstico no processo", async () => {
    const legacy = { pagination: { total: 5 }, data: [{ id: 1 }] };
    const rdb = recordingDb(db);
    const before = __shadowTesting.skippedUnsupported();
    const out = await runShadowComparison({ ...inAtibaia(), highlight_only: "true" }, legacy, {
      db: rdb,
      policy,
      cache: false,
      path: "/shadow-inv052-skipped",
    });
    // Contrato de retorno preservado.
    expect(out).toMatchObject({
      skipped: true,
      unsupported_params: ["highlight_only"],
      old_count: 5,
      new_count: null,
      timedOut: false,
    });
    expect(out).not.toHaveProperty("seller_count");
    // T5: o skip não executa SQL algum — nem contagem para "preencher" telemetria.
    expect(rdb.log).toEqual([]);
    // T2/T3: nada gravado para esta busca — nem seller_count null, nem 0.
    const { rows } = await db.query(`SELECT payload FROM analytics_events WHERE path = $1`, [
      "/shadow-inv052-skipped",
    ]);
    expect(rows).toEqual([]);
    expect(__shadowTesting.skippedUnsupported()).toBe(before + 1);
  });

  it("T4 zero real continua válido: shadow que conta e acha zero grava 0 / 0", async () => {
    const legacy = { pagination: { total: 0 }, data: [] };
    const out = await runShadowComparison(inAtibaia({ commercial_model: "Nenhum052" }), legacy, {
      db,
      policy,
      cache: false,
      path: "/shadow-inv052-zero",
      timeoutMs: 5000,
    });
    expect(out.timedOut).toBe(false);
    const { rows } = await db.query(`SELECT payload FROM analytics_events WHERE path = $1`, [
      "/shadow-inv052-zero",
    ]);
    expect(rows.length).toBe(1);
    expect(rows[0].payload).toMatchObject({ total_count: 0, seller_count: 0 });
  });

  // Sentinela final (describe.sequential): tudo que este arquivo gravou.
  it("T2 global: nenhum search.executed persistido tem seller_count/total_count ausente ou não numérico", async () => {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (
                WHERE jsonb_typeof(payload->'seller_count') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(payload->'total_count') IS DISTINCT FROM 'number'
              )::int AS bad
         FROM analytics_events WHERE event_type = 'search.executed'`
    );
    expect(rows[0].total).toBeGreaterThan(10); // não vacuoso
    expect(rows[0].bad).toBe(0);
  });
});
