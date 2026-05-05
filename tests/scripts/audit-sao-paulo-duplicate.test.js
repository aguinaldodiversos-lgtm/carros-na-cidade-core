import { describe, expect, it, vi } from "vitest";

// Mock do db.js — o script importa { pool, closeDatabasePool } no topo,
// e db.js tenta criar Pool real. Mock evita conexão.
vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  closeDatabasePool: vi.fn(async () => {}),
}));

const { runAudit, classifyScenario, parseArgs } = await import(
  "../../scripts/maintenance/audit-sao-paulo-duplicate.mjs"
);

// Helper: pool mockado que responde queries em ordem
function makeFakePool(responses) {
  const calls = [];
  let i = 0;
  return {
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      const next = responses[i++];
      if (typeof next === "function") return next({ sql, params });
      if (next === undefined) return { rows: [] };
      if (next instanceof Error) throw next;
      return next;
    }),
    calls,
  };
}

const BROKEN_CITY = {
  id: 1,
  name: "SÆo Paulo",
  state: "SP",
  slug: "sæo-paulo",
  normalized_name: "sæo paulo",
  ibge_code: null,
  is_active: true,
};
const CANONICAL_CITY = {
  id: 5278,
  name: "São Paulo",
  state: "SP",
  slug: "sao-paulo-sp",
  normalized_name: "sao paulo",
  ibge_code: 3550308,
  is_active: true,
};

const TEST_ADS_ID1 = [
  {
    id: 9,
    title: "Carro teste (seed)",
    slug: "carro-teste-seed",
    status: "active",
    city_id: 1,
    user_id: 100,
    created_at: "2025-01-01T00:00:00Z",
    parece_teste: true,
  },
  {
    id: 80,
    title: "Test Vehicle Test",
    slug: "test-vehicle-test",
    status: "active",
    city_id: 1,
    user_id: 100,
    created_at: "2025-01-02T00:00:00Z",
    parece_teste: true,
  },
];

const PAID_EVENT_ID1 = {
  id: 1,
  city_id: 1,
  title: "FeirÆo de Seminovos",
  status: "paid",
  payment_status: "paid",
  price: 499,
  created_at: "2025-02-01T00:00:00Z",
};

const REGION_MEMBERSHIP_ID1 = {
  id: 11,
  base_city_id: 1,
  member_city_id: 100,
  radius_km: 50,
  distance_km: 12.3,
  created_at: "2025-01-15T00:00:00Z",
  updated_at: null,
};

describe("parseArgs", () => {
  it("default: json=false", () => {
    expect(parseArgs(["node", "audit.mjs"])).toEqual({ json: false });
  });
  it("--json: json=true", () => {
    expect(parseArgs(["node", "audit.mjs", "--json"])).toEqual({ json: true });
  });
});

describe("classifyScenario — árvore de decisão", () => {
  it("D — vence quando há evento sensível, mesmo com tudo o resto OK", () => {
    const findings = {
      events: { id1: { ok: true, rows: [{ ...PAID_EVENT_ID1, sensivel: true }] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [], isZeroed: true } },
      region_memberships: { id1: { ok: true, rows: [] } },
      fkRefs: [],
    };
    const r = classifyScenario(findings);
    expect(r.scenario).toBe("D");
    expect(r.reasons.join(" ")).toMatch(/events sensíveis/);
  });

  it("C — region_memberships referenciando id=1 (e zero events sensíveis)", () => {
    const findings = {
      events: { id1: { ok: true, rows: [] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [], isZeroed: true } },
      region_memberships: { id1: { ok: true, rows: [REGION_MEMBERSHIP_ID1] } },
      fkRefs: [],
    };
    expect(classifyScenario(findings).scenario).toBe("C");
  });

  it("C — outras FKs (não-ads/events/metrics) com count_id_1 > 0", () => {
    const findings = {
      events: { id1: { ok: true, rows: [] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [], isZeroed: true } },
      region_memberships: { id1: { ok: true, rows: [] } },
      fkRefs: [
        { ok: true, table_name: "city_alerts", column_name: "city_id", count_id_1: 3, count_id_5278: 0 },
      ],
    };
    expect(classifyScenario(findings).scenario).toBe("C");
  });

  it("B — ads não-teste em city_id=1", () => {
    const findings = {
      events: { id1: { ok: true, rows: [] } },
      ads: {
        id1: {
          ok: true,
          rows: [{ id: 99, title: "Honda Civic 2018", parece_teste: false }],
        },
      },
      city_metrics: { id1: { ok: true, rows: [], isZeroed: true } },
      region_memberships: { id1: { ok: true, rows: [] } },
      fkRefs: [],
    };
    expect(classifyScenario(findings).scenario).toBe("B");
  });

  it("A — só testes + metrics zerada + sem refs fortes", () => {
    const findings = {
      events: { id1: { ok: true, rows: [] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [{ city_id: 1, total: 0 }], isZeroed: true } },
      region_memberships: { id1: { ok: true, rows: [] } },
      fkRefs: [],
    };
    expect(classifyScenario(findings).scenario).toBe("A");
  });

  it("ignora fkRefs nas tabelas conhecidas (ads/city_metrics/events) — já cobertas em outras camadas", () => {
    const findings = {
      events: { id1: { ok: true, rows: [] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [], isZeroed: true } },
      region_memberships: { id1: { ok: true, rows: [] } },
      fkRefs: [
        { ok: true, table_name: "ads", column_name: "city_id", count_id_1: 2, count_id_5278: 0 },
        { ok: true, table_name: "events", column_name: "city_id", count_id_1: 1, count_id_5278: 0 },
        { ok: true, table_name: "city_metrics", column_name: "city_id", count_id_1: 1, count_id_5278: 0 },
      ],
    };
    // Sem outros refs nem region_memberships, com ads de teste e metrics
    // zerada → A.
    expect(classifyScenario(findings).scenario).toBe("A");
  });
});

describe("runAudit — orquestração", () => {
  it("identifica id=1 quebrado e id=5278 correto, classifica D quando há paid event", async () => {
    // Sequência exata de queries que o runAudit faz:
    // 1. auditCities
    // 2. auditAds(BROKEN_ID)
    // 3. auditAds(CANONICAL_ID)
    // 4. auditCityMetrics(BROKEN_ID)
    // 5. auditCityMetrics(CANONICAL_ID)
    // 6. auditEvents(BROKEN_ID)
    // 7. auditEvents(CANONICAL_ID)
    // 8. auditRegionMemberships(BROKEN_ID)
    // 9. auditRegionMemberships(CANONICAL_ID)
    // 10. listForeignKeysReferencingCities
    const pg = makeFakePool([
      { rows: [BROKEN_CITY, CANONICAL_CITY] }, // 1
      { rows: TEST_ADS_ID1 }, // 2
      { rows: [] }, // 3
      { rows: [{ city_id: 1, total: 0, leads: 0 }] }, // 4
      { rows: [] }, // 5
      { rows: [PAID_EVENT_ID1] }, // 6 — paid event
      { rows: [] }, // 7
      { rows: [REGION_MEMBERSHIP_ID1] }, // 8
      { rows: [] }, // 9
      { rows: [{ table_name: "ads", column_name: "city_id" }] }, // 10
      // 10 → cada FK gera count: 11 FK1 count
      { rows: [{ count_id_1: 2, count_id_5278: 0 }] },
    ]);

    const log = vi.fn();
    const result = await runAudit({ pg, log });

    expect(result.findings.cities).toHaveLength(2);
    expect(result.findings.cities.map((c) => c.id).sort()).toEqual([1, 5278]);

    expect(result.findings.ads.id1.ok).toBe(true);
    expect(result.findings.ads.id1.rows).toHaveLength(2);
    expect(result.findings.ads.id1.rows.every((a) => a.parece_teste)).toBe(true);

    expect(result.findings.events.id1.rows[0].sensivel).toBe(true);
    expect(result.findings.region_memberships.id1.rows).toHaveLength(1);

    expect(result.classification.scenario).toBe("D");
  });

  it("classifica C quando não há paid event mas há region_memberships", async () => {
    const eventNoPay = { ...PAID_EVENT_ID1, status: "draft", payment_status: null, price: 0 };
    const pg = makeFakePool([
      { rows: [BROKEN_CITY, CANONICAL_CITY] },
      { rows: TEST_ADS_ID1 },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [eventNoPay] },
      { rows: [] },
      { rows: [REGION_MEMBERSHIP_ID1] },
      { rows: [] },
      { rows: [] }, // sem FKs adicionais
    ]);

    const result = await runAudit({ pg, log: () => {} });
    expect(result.classification.scenario).toBe("C");
  });

  it("tabelas ausentes (42P01) não quebram a auditoria — degradam pra missing", async () => {
    const undefinedTable = Object.assign(new Error('relation "events" does not exist'), {
      code: "42P01",
    });
    const pg = makeFakePool([
      { rows: [BROKEN_CITY, CANONICAL_CITY] }, // cities
      { rows: TEST_ADS_ID1 }, // ads id=1
      { rows: [] }, // ads id=5278
      { rows: [] }, // metrics id=1
      { rows: [] }, // metrics id=5278
      undefinedTable, // events id=1 → missing
      undefinedTable, // events id=5278 → missing
      { rows: [] }, // rm id=1
      { rows: [] }, // rm id=5278
      { rows: [] }, // FKs vazias
    ]);

    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.events.id1.missing).toBe(true);
    // Sem events sensíveis, sem rm, ads de teste → classificação A
    expect(result.classification.scenario).toBe("A");
  });
});
