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
    // region_memberships SELECT broken
    {
      match: /FROM region_memberships WHERE base_city_id = \$1 OR member_city_id = \$1/,
      response: { rows: overrides.rmBroken ?? [RM_SELF_BROKEN] },
    },
    // region_memberships canonical
    {
      match: /FROM region_memberships WHERE base_city_id = \$1 AND member_city_id = \$1 LIMIT 1/,
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

  it("ausência da linha canônica 5278→5278 → aborta", async () => {
    const pg = makePoolByMatcher(happyPathMatchers({ rmCanonical: [] }));
    const r = await validatePreconditions({
      pg,
      scenario: "confirmed-test-data-cleanup",
      args: happyArgs,
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/canônico precisa estar saudável/);
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
