import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  closeDatabasePool: vi.fn(async () => {}),
}));

const {
  runCleanup,
  planScenario,
  parseArgs,
  validatePreconditions,
  captureSnapshot,
  toNumber,
  sameId,
  isZeroDistance,
} = await import("../../scripts/maintenance/cleanup-sao-paulo-duplicate.mjs");

// ─────────────────────────────────────────────────────────────────────
// Pool mockado por matcher de SQL — mesmo padrão usado nos testes do
// audit. Match-first semantics: o primeiro regex a casar serve.
// ─────────────────────────────────────────────────────────────────────

function makePoolByMatcher(matchers) {
  const calls = [];
  return {
    query: vi.fn(async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      for (const m of matchers) {
        if (m.match.test(text)) {
          const r = typeof m.response === "function" ? m.response({ sql: text, params }) : m.response;
          if (r instanceof Error) throw r;
          return r;
        }
      }
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(),
    calls,
  };
}

function makePoolWithClient({ poolMatchers, clientResponses = [] }) {
  const pg = makePoolByMatcher(poolMatchers);
  const clientCalls = [];
  let i = 0;
  const client = {
    query: vi.fn(async (sql, params) => {
      clientCalls.push({ sql: String(sql).trim(), params });
      const next = clientResponses[i++];
      if (next === undefined) return { rows: [], rowCount: 0 };
      if (next instanceof Error) throw next;
      return next;
    }),
    release: vi.fn(),
  };
  pg.connect = vi.fn(async () => client);
  pg.client = client;
  pg.clientCalls = clientCalls;
  return pg;
}

// ─────────────────────────────────────────────────────────────────────
// Fixtures do estado real em produção (após audit confirmar D)
// ─────────────────────────────────────────────────────────────────────

const BROKEN_CITY = {
  id: 1,
  name: "SÆo Paulo",
  state: "SP",
  slug: "sæo-paulo",
  is_active: true,
  ibge_code: null,
};
const CANONICAL_CITY = {
  id: 5278,
  name: "São Paulo",
  state: "SP",
  slug: "sao-paulo-sp",
  is_active: true,
  ibge_code: 3550308,
};
const TEST_AD_9 = { id: 9, title: "Carro teste (seed)", slug: "carro-teste-seed", status: "active", city_id: 1 };
const TEST_AD_80 = { id: 80, title: "Test Vehicle Test", slug: "test-vehicle-test", status: "active", city_id: 1 };
const PAID_EVENT_4 = {
  id: 4,
  city_id: 1,
  title: "FeirÆo de Seminovos",
  status: "paid",
  payment_status: "paid",
  price: 499,
  payment_id: null,
};
const CITY_METRICS_ZEROED = {
  id: 1,
  city_id: 1,
  visits: 0,
  leads: 0,
  ads_count: 0,
  advertisers_count: 0,
  total_leads: 0,
  demand_score: 0,
  dealer_pipeline_leads: 0,
  dealer_outreach_sent: 0,
  conversion_rate: 0,
  roi_score: "0.0000",
};
const CITY_STATUS_EXPLORING = { city_id: 1, status: "exploring", score: 0 };
const RM_SELF_BROKEN = { base_city_id: 1, member_city_id: 1, distance_km: 0 };
const RM_SELF_CANONICAL = { base_city_id: 5278, member_city_id: 5278, distance_km: 0 };

/**
 * Conjunto de matchers que respondem o "happy path" do cenário
 * confirmed-test-data-cleanup com o estado real de produção.
 */
function happyPathMatchers(overrides = {}) {
  return [
    {
      match: /SELECT id, name, slug, state, is_active, ibge_code FROM cities WHERE id = \$1/,
      response: ({ params }) => {
        if (params?.[0] === 1) return { rows: [overrides.broken ?? BROKEN_CITY] };
        if (params?.[0] === 5278) return { rows: [overrides.canonical ?? CANONICAL_CITY] };
        return { rows: [] };
      },
    },
    // ads (status=active, city_id=1) — para validateConfirmedCleanup
    {
      match: /FROM ads\s+WHERE city_id = \$1 AND status = 'active'/,
      response: { rows: overrides.activeAds ?? [TEST_AD_9, TEST_AD_80] },
    },
    // events columns introspect
    {
      match: /information_schema\.columns WHERE table_name = 'events'/,
      response: {
        rows: [
          { column_name: "id" },
          { column_name: "city_id" },
          { column_name: "title" },
          { column_name: "status" },
          { column_name: "payment_status" },
          { column_name: "price" },
          { column_name: "payment_id" },
        ],
      },
    },
    // events SELECT
    {
      match: /FROM events\s+WHERE city_id = \$1\s+ORDER BY id/,
      response: { rows: overrides.events ?? [PAID_EVENT_4] },
    },
    // pg_constraint check
    {
      match: /FROM pg_constraint\s+WHERE contype = 'c'/,
      response: { rows: overrides.checkConstraints ?? [] },
    },
    // city_metrics columns introspect
    {
      match: /information_schema\.columns WHERE table_name='city_metrics'/,
      response: { rows: [{ column_name: "city_id" }, { column_name: "visits" }, { column_name: "leads" }] },
    },
    // city_metrics rows
    {
      match: /SELECT \* FROM city_metrics WHERE city_id = \$1/,
      response: { rows: overrides.cityMetrics ?? [CITY_METRICS_ZEROED] },
    },
    // city_status columns introspect
    {
      match: /information_schema\.columns WHERE table_name='city_status'/,
      response: { rows: [{ column_name: "city_id" }, { column_name: "status" }, { column_name: "score" }] },
    },
    // city_status rows
    {
      match: /SELECT \* FROM city_status WHERE city_id = \$1/,
      response: { rows: overrides.cityStatus ?? [CITY_STATUS_EXPLORING] },
    },
    // region_memberships columns introspect
    {
      match: /information_schema\.columns WHERE table_name='region_memberships'/,
      response: { rows: [{ column_name: "base_city_id" }, { column_name: "member_city_id" }, { column_name: "distance_km" }] },
    },
    // region_memberships SELECT broken — agora com LEFT JOIN cities
    {
      match: /FROM region_memberships rm[\s\S]*WHERE rm\.base_city_id = \$1 OR rm\.member_city_id = \$1/,
      response: { rows: overrides.rmBroken ?? [RM_SELF_BROKEN] },
    },
    // region_memberships canonical — agora com LEFT JOIN cities + LIMIT 1
    {
      match: /FROM region_memberships rm[\s\S]*WHERE rm\.base_city_id = \$1 AND rm\.member_city_id = \$1[\s\S]*LIMIT 1/,
      response: { rows: overrides.rmCanonical ?? [RM_SELF_CANONICAL] },
    },
    // tableHasColumn — para FORBIDDEN_REF_TABLES
    {
      match: /FROM information_schema\.columns\s+WHERE table_name = \$1 AND column_name = \$2\s+LIMIT 1/,
      response: ({ params }) => {
        // Forbidden tables não existem por default → retorna 0 rows
        const tbl = params?.[0];
        if (overrides.forbiddenTablesPresent?.includes(tbl)) {
          return { rows: [{ "?column?": 1 }] };
        }
        return { rows: [] };
      },
    },
    // forbidden ref counts
    {
      match: /SELECT COUNT\(\*\)::int AS n FROM \w+ WHERE city_id = \$1/,
      response: ({ sql }) => {
        for (const tbl of overrides.forbiddenRefs ?? []) {
          if (sql.includes(`FROM ${tbl}`)) return { rows: [{ n: 1 }] };
        }
        return { rows: [{ n: 0 }] };
      },
    },
    // captureSnapshot queries
    { match: /SELECT \* FROM cities WHERE id = \$1/, response: { rows: [overrides.broken ?? BROKEN_CITY] } },
    {
      match: /SELECT \* FROM ads WHERE id = ANY\(\$1::int\[\]\)/,
      response: { rows: [TEST_AD_9, TEST_AD_80] },
    },
    {
      match: /SELECT \* FROM events WHERE id = \$1/,
      response: { rows: [PAID_EVENT_4] },
    },
    {
      match: /SELECT \* FROM region_memberships WHERE base_city_id = \$1 AND member_city_id = \$1\b/,
      response: { rows: [RM_SELF_BROKEN] },
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────
// parseArgs
// ─────────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("default: dry-run, sem cenário, sem confirms", () => {
    expect(parseArgs(["node", "x.mjs"])).toEqual({
      scenario: null,
      yes: false,
      confirmEventId: null,
      confirmBrokenCityId: null,
      confirmCanonicalCityId: null,
      dryRun: true,
    });
  });

  it("--scenario=archive-test-data", () => {
    const a = parseArgs(["node", "x.mjs", "--scenario=archive-test-data"]);
    expect(a.scenario).toBe("archive-test-data");
    expect(a.dryRun).toBe(true);
  });

  it("--yes força dryRun=false", () => {
    const a = parseArgs(["node", "x.mjs", "--scenario=archive-test-data", "--yes"]);
    expect(a.yes).toBe(true);
    expect(a.dryRun).toBe(false);
  });

  it("--confirm-event-id / --confirm-broken-city-id / --confirm-canonical-city-id", () => {
    const a = parseArgs([
      "node",
      "x.mjs",
      "--scenario=confirmed-test-data-cleanup",
      "--confirm-event-id=4",
      "--confirm-broken-city-id=1",
      "--confirm-canonical-city-id=5278",
    ]);
    expect(a.confirmEventId).toBe(4);
    expect(a.confirmBrokenCityId).toBe(1);
    expect(a.confirmCanonicalCityId).toBe(5278);
  });
});

// ─────────────────────────────────────────────────────────────────────
// planScenario
// ─────────────────────────────────────────────────────────────────────

describe("planScenario", () => {
  it("archive-test-data: 1 step (UPDATE ads)", () => {
    const steps = planScenario("archive-test-data");
    expect(steps).toHaveLength(1);
    expect(steps[0].sql).toMatch(/UPDATE ads/);
  });

  it("confirmed-test-data-cleanup: 6 steps em ordem (event → ads → rm → metrics → status → cities)", () => {
    const steps = planScenario("confirmed-test-data-cleanup");
    expect(steps).toHaveLength(6);
    expect(steps[0].sql).toMatch(/UPDATE events/);
    expect(steps[0].sql).toMatch(/SET status = 'cancelled'/);
    expect(steps[1].sql).toMatch(/UPDATE ads/);
    expect(steps[1].sql).toMatch(/SET status = 'archived'/);
    expect(steps[2].sql).toMatch(/DELETE FROM region_memberships/);
    expect(steps[3].sql).toMatch(/DELETE FROM city_metrics/);
    expect(steps[4].sql).toMatch(/DELETE FROM city_status/);
    expect(steps[5].sql).toMatch(/UPDATE cities/);
    expect(steps[5].sql).toMatch(/SET is_active = false/);
    // NUNCA toca cities.id=5278
    for (const step of steps) {
      expect(step.sql).not.toMatch(/id\s*=\s*5278/);
      expect(JSON.stringify(step.params)).not.toContain("5278");
    }
  });

  it("cenário desconhecido → throw", () => {
    expect(() => planScenario("delete-everything")).toThrow(/cenário não suportado/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// runCleanup — guards de entrada
// ─────────────────────────────────────────────────────────────────────

describe("runCleanup — guards", () => {
  it("sem --scenario → aborta sem tocar o banco", async () => {
    const pg = makePoolByMatcher([]);
    const result = await runCleanup({ scenario: null, dryRun: true, pg, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_scenario");
    expect(pg.query).not.toHaveBeenCalled();
  });

  it("cenário desconhecido → aborta sem tocar o banco", async () => {
    const pg = makePoolByMatcher([]);
    const result = await runCleanup({
      scenario: "delete-everything",
      dryRun: true,
      pg,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unknown_scenario");
    expect(pg.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// validatePreconditions confirmed-test-data-cleanup
// ─────────────────────────────────────────────────────────────────────

describe("confirmed-test-data-cleanup — pré-condições", () => {
  const happyArgs = {
    confirmEventId: 4,
    confirmBrokenCityId: 1,
    confirmCanonicalCityId: 5278,
  };

  it("happy path: pré-condições OK", async () => {
    const pg = makePoolByMatcher(happyPathMatchers());
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(true);
  });

  it("--confirm-event-id ausente → aborta", async () => {
    const pg = makePoolByMatcher(happyPathMatchers());
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: { ...happyArgs, confirmEventId: null },
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/--confirm-event-id/);
  });

  it("--confirm-broken-city-id ausente → aborta", async () => {
    const pg = makePoolByMatcher(happyPathMatchers());
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: { ...happyArgs, confirmBrokenCityId: null },
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/--confirm-broken-city-id/);
  });

  it("--confirm-canonical-city-id ausente → aborta", async () => {
    const pg = makePoolByMatcher(happyPathMatchers());
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: { ...happyArgs, confirmCanonicalCityId: null },
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/--confirm-canonical-city-id/);
  });

  it("evento com id ≠ 4 → aborta", async () => {
    const pg = makePoolByMatcher(
      happyPathMatchers({ events: [{ ...PAID_EVENT_4, id: 99 }] })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/events.id=99/);
  });

  it("evento com payment_id real → aborta (pagamento real)", async () => {
    const pg = makePoolByMatcher(
      happyPathMatchers({ events: [{ ...PAID_EVENT_4, payment_id: "MP-123-real" }] })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/payment_id.*Pagamento real/);
  });

  it("region_memberships com linha extra (não-autoref) → aborta", async () => {
    const extra = { base_city_id: 1, member_city_id: 999, distance_km: 10 };
    const pg = makePoolByMatcher(
      happyPathMatchers({ rmBroken: [RM_SELF_BROKEN, extra] })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/linha\(s\) extras/);
  });

  it("id=1 SÓ como member (sem autoref): aborta com diagnóstico detalhado das linhas reais", async () => {
    // Cenário real encontrado no dry-run de produção (2026-05-04):
    // não havia linha 1→1, mas havia 1 linha apontando id=1 como
    // member de outra cidade. Esperado: pré-condição falha E reasons
    // listam a linha real (com nome/slug das pontas) pra operador ver.
    const memberOnly = {
      base_city_id: 200,
      member_city_id: 1,
      distance_km: 10,
      base_name: "Cidade Base",
      base_slug: "cidade-base-sp",
      base_state: "SP",
      member_name: "SÆo Paulo",
      member_slug: "sæo-paulo",
      member_state: "SP",
    };
    const pg = makePoolByMatcher(
      happyPathMatchers({ rmBroken: [memberOnly] })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    const all = r.reasons.join("\n");
    // Sintetiza: "esperado 1, encontrado 0" para autoref
    expect(all).toMatch(/esperado exatamente 1 linha, encontrado 0/);
    // E inclui "1 linha extra"
    expect(all).toMatch(/1 linha\(s\) extras/);
    // E DETALHA a linha real com nomes/slugs/distance — esse é o
    // ponto novo desta correção: operador não precisa rodar SELECT
    // adicional para ver o que tem no banco.
    expect(all).toMatch(/region_memberships envolvendo city_id=1/);
    expect(all).toMatch(/base=200\/cidade-base-sp/);
    expect(all).toMatch(/member=1\/sæo-paulo/);
    expect(all).toMatch(/distance_km=10/);
  });

  it("region_memberships zero linhas envolvendo id=1: aborta com mensagem de cleanup parcial", async () => {
    const pg = makePoolByMatcher(happyPathMatchers({ rmBroken: [] }));
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/zero linhas referenciando city_id=1/);
  });

  it("ausência da linha canônica 5278→5278 → aborta", async () => {
    const pg = makePoolByMatcher(happyPathMatchers({ rmCanonical: [] }));
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/canônic[ao] precisa estar saudável/);
  });

  it("ads ativos diferentes de [9, 80] → aborta", async () => {
    const adReal = { id: 99, title: "Honda Civic 2018", slug: "honda-civic-2018", status: "active", city_id: 1 };
    const pg = makePoolByMatcher(happyPathMatchers({ activeAds: [adReal] }));
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/ads ativos em city_id=1 não batem/);
  });

  it("CHECK constraint em status sem 'cancelled' → aborta com instrução manual", async () => {
    const checks = [
      {
        conname: "events_status_check",
        def: "CHECK ((status IN ('queued', 'active', 'paid', 'finished')))",
      },
    ];
    const pg = makePoolByMatcher(happyPathMatchers({ checkConstraints: checks }));
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/CHECK constraint.*status.*NÃO inclui 'cancelled'/);
  });

  it("ref proibida em seo_cluster_plans → aborta", async () => {
    const pg = makePoolByMatcher(
      happyPathMatchers({
        forbiddenTablesPresent: ["seo_cluster_plans"],
        forbiddenRefs: ["seo_cluster_plans"],
      })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/seo_cluster_plans tem 1 linha/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// captureSnapshot
// ─────────────────────────────────────────────────────────────────────

describe("captureSnapshot — confirmed-test-data-cleanup", () => {
  it("captura cities, ads, events, city_metrics, city_status, region_memberships", async () => {
    const pg = makePoolByMatcher(happyPathMatchers());
    const snap = await captureSnapshot({ pg, scenario: "confirmed-test-data-cleanup" });
    expect(snap.cities_id_1).toEqual([BROKEN_CITY]);
    expect(snap.ads).toEqual([TEST_AD_9, TEST_AD_80]);
    expect(snap.events_id_4).toEqual([PAID_EVENT_4]);
    expect(snap.city_metrics).toEqual([CITY_METRICS_ZEROED]);
    expect(snap.city_status).toEqual([CITY_STATUS_EXPLORING]);
    expect(snap.region_memberships_self).toEqual([RM_SELF_BROKEN]);
  });

  it("snapshot é null pra cenário archive-test-data", async () => {
    const pg = makePoolByMatcher([]);
    const snap = await captureSnapshot({ pg, scenario: "archive-test-data" });
    expect(snap).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// runCleanup — dry-run NUNCA escreve
// ─────────────────────────────────────────────────────────────────────

describe("runCleanup — dry-run nunca escreve", () => {
  it("confirmed-test-data-cleanup dry-run com tudo OK: snapshot capturado, NÃO toca client (sem connect)", async () => {
    const pg = makePoolByMatcher(happyPathMatchers());
    pg.connect = vi.fn();
    const writeSnapshot = vi.fn(() => "/fake/path/snapshot.json");
    const result = await runCleanup({
      scenario: "confirmed-test-data-cleanup",
      dryRun: true,
      args: { confirmEventId: 4, confirmBrokenCityId: 1, confirmCanonicalCityId: 5278 },
      pg,
      log: () => {},
      writeSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.snapshot).toBeTruthy();
    expect(result.snapshotFile).toBe("/fake/path/snapshot.json");
    expect(result.rollbackSql.length).toBeGreaterThan(0);
    // Nenhuma das queries chamadas é UPDATE/DELETE/INSERT
    for (const call of pg.query.mock.calls) {
      const sql = String(call[0]);
      expect(sql).not.toMatch(/^\s*UPDATE/i);
      expect(sql).not.toMatch(/^\s*DELETE/i);
      expect(sql).not.toMatch(/^\s*INSERT/i);
    }
    expect(pg.connect).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// runCleanup com --yes — caminho feliz
// ─────────────────────────────────────────────────────────────────────

describe("runCleanup com --yes — confirmed-test-data-cleanup happy path", () => {
  it("estado limpo → BEGIN + 6 steps + COMMIT, snapshot persistido, totalAffected somado", async () => {
    const clientResponses = [
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 1 }, // step 1: UPDATE events
      { rows: [], rowCount: 2 }, // step 2: UPDATE ads (2 rows)
      { rows: [], rowCount: 1 }, // step 3: DELETE region_memberships
      { rows: [], rowCount: 1 }, // step 4: DELETE city_metrics
      { rows: [], rowCount: 1 }, // step 5: DELETE city_status
      { rows: [], rowCount: 1 }, // step 6: UPDATE cities
      { rows: [], rowCount: 0 }, // COMMIT
    ];
    const pg = makePoolWithClient({
      poolMatchers: happyPathMatchers(),
      clientResponses,
    });
    const writeSnapshot = vi.fn(() => "/fake/path/snapshot.json");

    const result = await runCleanup({
      scenario: "confirmed-test-data-cleanup",
      dryRun: false,
      args: { confirmEventId: 4, confirmBrokenCityId: 1, confirmCanonicalCityId: 5278 },
      pg,
      log: () => {},
      writeSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.totalAffected).toBe(7); // 1+2+1+1+1+1
    expect(result.snapshotFile).toBe("/fake/path/snapshot.json");

    const sqls = pg.clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    expect(sqls.some((s) => /UPDATE events/.test(s))).toBe(true);
    expect(sqls.some((s) => /DELETE FROM region_memberships/.test(s))).toBe(true);
    expect(sqls.some((s) => /UPDATE cities/.test(s))).toBe(true);
    // Sanity: nenhuma das SQLs do client toca id=5278
    for (const c of pg.clientCalls) {
      expect(c.sql).not.toMatch(/id\s*=\s*5278/);
    }
  });

  it("erro durante UPDATE → ROLLBACK, NÃO commita, snapshot ainda exposto", async () => {
    const dbErr = new Error("CHECK constraint violation: status");
    const pg = makePoolWithClient({
      poolMatchers: happyPathMatchers(),
      clientResponses: [
        { rows: [], rowCount: 0 }, // BEGIN
        dbErr, // step 1 explode
        { rows: [], rowCount: 0 }, // ROLLBACK
      ],
    });
    const result = await runCleanup({
      scenario: "confirmed-test-data-cleanup",
      dryRun: false,
      args: { confirmEventId: 4, confirmBrokenCityId: 1, confirmCanonicalCityId: 5278 },
      pg,
      log: () => {},
      writeSnapshot: () => null,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("transaction_error");
    const sqls = pg.clientCalls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
    expect(result.snapshot).toBeTruthy(); // snapshot foi capturado antes
    expect(result.rollbackSql.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// archive-test-data continua funcionando (regressão)
// ─────────────────────────────────────────────────────────────────────

describe("regressão — archive-test-data continua bloqueado por refs fortes", () => {
  it("paid event → aborta antes de BEGIN", async () => {
    const matchers = [
      {
        match: /SELECT id, name, slug, state, is_active, ibge_code FROM cities WHERE id = \$1/,
        response: ({ params }) =>
          params?.[0] === 1 ? { rows: [BROKEN_CITY] } : { rows: [CANONICAL_CITY] },
      },
      {
        match: /FROM ads\s+WHERE id = ANY\(\$1::int\[\]\)\s+ORDER BY id/,
        response: { rows: [TEST_AD_9, TEST_AD_80] },
      },
      {
        match: /COUNT\(\*\)::int AS n\s+FROM events/,
        response: { rows: [{ n: 1 }] },
      },
      {
        match: /COUNT\(\*\)::int AS n FROM region_memberships/,
        response: { rows: [{ n: 0 }] },
      },
    ];
    const pg = makePoolByMatcher(matchers);
    pg.connect = vi.fn();

    const result = await runCleanup({
      scenario: "archive-test-data",
      dryRun: false,
      pg,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("preconditions_failed");
    expect(pg.connect).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// helpers de coerção (toNumber / sameId / isZeroDistance)
// ─────────────────────────────────────────────────────────────────────

describe("toNumber", () => {
  it("number finito → ele mesmo", () => {
    expect(toNumber(1)).toBe(1);
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-3.14)).toBe(-3.14);
  });
  it("string parseável → number", () => {
    expect(toNumber("1")).toBe(1);
    expect(toNumber("0")).toBe(0);
    expect(toNumber("0.0000")).toBe(0);
    expect(toNumber("  10  ")).toBe(10);
  });
  it("null / undefined / vazio / NaN-like → null", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });
});

describe("sameId", () => {
  it("aceita number e string equivalentes", () => {
    expect(sameId(1, 1)).toBe(true);
    expect(sameId("1", 1)).toBe(true);
    expect(sameId(" 1 ", 1)).toBe(true);
    expect(sameId(5278, 5278)).toBe(true);
    expect(sameId("5278", 5278)).toBe(true);
  });
  it("rejeita IDs diferentes", () => {
    expect(sameId(2, 1)).toBe(false);
    expect(sameId("2", 1)).toBe(false);
    expect(sameId(null, 1)).toBe(false);
    expect(sameId(undefined, 1)).toBe(false);
    expect(sameId("", 1)).toBe(false);
    expect(sameId("abc", 1)).toBe(false);
  });
});

describe("isZeroDistance", () => {
  it("aceita zero em qualquer formato comum do pg driver", () => {
    expect(isZeroDistance(0)).toBe(true);
    expect(isZeroDistance(0.0)).toBe(true);
    expect(isZeroDistance("0")).toBe(true);
    expect(isZeroDistance("0.0")).toBe(true);
    expect(isZeroDistance("0.0000")).toBe(true);
    expect(isZeroDistance(" 0 ")).toBe(true);
  });
  it("null/undefined contam como zero (alinhado a COALESCE(distance_km,0)=0)", () => {
    expect(isZeroDistance(null)).toBe(true);
    expect(isZeroDistance(undefined)).toBe(true);
  });
  it("rejeita valores não-zero", () => {
    expect(isZeroDistance(10)).toBe(false);
    expect(isZeroDistance("10")).toBe(false);
    expect(isZeroDistance("0.0001")).toBe(false);
    expect(isZeroDistance("abc")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// region_memberships: tolerância string vs number (regressão produção)
// ─────────────────────────────────────────────────────────────────────

describe("validatePreconditions — region_memberships com tipos mistos", () => {
  const happyArgs = {
    confirmEventId: 4,
    confirmBrokenCityId: 1,
    confirmCanonicalCityId: 5278,
  };

  it("autoref com strings (\"1\"/\"1\"/\"0\") — caso real produção — passa", async () => {
    // Estado encontrado no dry-run de prod (2026-05-04): pg driver
    // devolveu base_city_id="1", member_city_id="1", distance_km="0"
    // (numeric/decimal ou parseInt8=false). Antes da correção, `===`
    // contra o número 1/0 falhava e a pré-condição dava `encontrado 0`.
    const rmStringRow = {
      base_city_id: "1",
      member_city_id: "1",
      distance_km: "0",
    };
    const pg = makePoolByMatcher(happyPathMatchers({ rmBroken: [rmStringRow] }));
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(true);
  });

  it("autoref numérica (1/1/0) — caso fixture — passa", async () => {
    const pg = makePoolByMatcher(happyPathMatchers());
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(true);
  });

  it("autoref com distance_km=\"10\" (string) — aborta", async () => {
    const pg = makePoolByMatcher(
      happyPathMatchers({
        rmBroken: [{ base_city_id: "1", member_city_id: "1", distance_km: "10" }],
      })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/distance_km=10 ≠ 0/);
  });

  it("base=\"1\" / member=\"200\" (string) — classifica como otherRef e aborta", async () => {
    const pg = makePoolByMatcher(
      happyPathMatchers({
        rmBroken: [
          { base_city_id: "1", member_city_id: "1", distance_km: "0" },
          { base_city_id: "1", member_city_id: "200", distance_km: "10" },
        ],
      })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/1 linha\(s\) extras/);
  });

  it("base=\"200\" / member=\"1\" (string) — classifica como otherRef e aborta", async () => {
    const pg = makePoolByMatcher(
      happyPathMatchers({
        rmBroken: [
          { base_city_id: "1", member_city_id: "1", distance_km: "0" },
          { base_city_id: "200", member_city_id: "1", distance_km: "10" },
        ],
      })
    );
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/1 linha\(s\) extras/);
  });

  it("não toca cities.id=5278 mesmo com tipos mistos no rm", async () => {
    // Sanity defensiva: garante que o caminho com strings não muda o
    // plano gerado (continua sem mencionar 5278 em qualquer step).
    const steps = planScenario("confirmed-test-data-cleanup");
    for (const s of steps) {
      expect(s.sql).not.toMatch(/id\s*=\s*5278/);
      expect(JSON.stringify(s.params)).not.toContain("5278");
    }
  });
});
