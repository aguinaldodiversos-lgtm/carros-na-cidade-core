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

/**
 * Pool mockado por *matcher de SQL*. Cada matcher é um par
 * `{ match: RegExp, response: object | (call) => object | Error }`.
 * O primeiro matcher cujo regex bater na SQL é usado e — opcionalmente —
 * removido após N usos.
 *
 * Mais robusto que ordem absoluta: as auditorias agora fazem
 * introspecção (`information_schema`) antes do SELECT real, e a ordem
 * exata das chamadas pode mudar. Match por padrão dá tolerância.
 */
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
      // Default: retorna vazio. Permite que tabelas/FKs não-cobertas
      // pelos matchers ainda funcionem (caem em "missing" ou rows: []).
      return { rows: [] };
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

// Schema real (advertiser_id, sem user_id) — replicar fielmente.
const ADS_COLUMNS_REAL = [
  { column_name: "id" },
  { column_name: "title" },
  { column_name: "slug" },
  { column_name: "status" },
  { column_name: "city_id" },
  { column_name: "advertiser_id" },
  { column_name: "created_at" },
  { column_name: "updated_at" },
];

const TEST_ADS_ID1 = [
  {
    id: 9,
    title: "Carro teste (seed)",
    slug: "carro-teste-seed",
    status: "active",
    city_id: 1,
    advertiser_id: 100,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: null,
    parece_teste: true,
  },
  {
    id: 80,
    title: "Test Vehicle Test",
    slug: "test-vehicle-test",
    status: "active",
    city_id: 1,
    advertiser_id: 100,
    created_at: "2025-01-02T00:00:00Z",
    updated_at: null,
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

// region_memberships SEM id (schema real do projeto): só tem
// base_city_id, member_city_id, radius_km, distance_km, created_at, updated_at.
const RM_COLUMNS_REAL = [
  { column_name: "base_city_id" },
  { column_name: "member_city_id" },
  { column_name: "radius_km" },
  { column_name: "distance_km" },
  { column_name: "created_at" },
  { column_name: "updated_at" },
];

const RM_ROW_BASE_1 = {
  row_no: "1",
  base_city_id: 1,
  member_city_id: 100,
  radius_km: 50,
  distance_km: 12.3,
  created_at: "2025-01-15T00:00:00Z",
  updated_at: null,
  base_name: "SÆo Paulo",
  base_slug: "sæo-paulo",
  base_state: "SP",
  member_name: "Outra",
  member_slug: "outra-sp",
  member_state: "SP",
};
const RM_ROW_MEMBER_1 = {
  row_no: "2",
  base_city_id: 200,
  member_city_id: 1,
  radius_km: 60,
  distance_km: 7.5,
  created_at: "2025-01-15T00:00:00Z",
  updated_at: null,
  base_name: "Cidade Base",
  base_slug: "cidade-base-sp",
  base_state: "SP",
  member_name: "SÆo Paulo",
  member_slug: "sæo-paulo",
  member_state: "SP",
};

const CITY_STATUS_COLUMNS = [{ column_name: "city_id" }, { column_name: "status" }];
const CITY_STATUS_ROW_ID1 = { city_id: 1, status: "manual_review" };

// city_metrics: campos zerados, mas com `roi_score` como string
// "0.0000" (decimal/numeric do pg vira string no driver).
const CITY_METRICS_ROW_ID1_ZEROED = {
  id: 1,
  city_id: 1,
  visits: 0,
  leads: 0,
  ads_count: 0,
  advertisers_count: 0,
  conversion_rate: 0,
  total_leads: 0,
  roi_score: "0.0000",
  demand_score: 0,
  dealer_pipeline_leads: 0,
  dealer_outreach_sent: 0,
  updated_at: "2025-03-01T00:00:00Z",
};

// ────────────────────────────────────────────────────────────────────
// parseArgs
// ────────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("default: json=false", () => {
    expect(parseArgs(["node", "audit.mjs"])).toEqual({ json: false });
  });
  it("--json: json=true", () => {
    expect(parseArgs(["node", "audit.mjs", "--json"])).toEqual({ json: true });
  });
});

// ────────────────────────────────────────────────────────────────────
// classifyScenario — árvore de decisão
// ────────────────────────────────────────────────────────────────────

describe("classifyScenario — árvore de decisão", () => {
  it("D vence quando há evento sensível, mas reasons inclui contexto adicional", () => {
    const findings = {
      events: { id1: { ok: true, rows: [{ ...PAID_EVENT_ID1, sensivel: true }] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [CITY_METRICS_ROW_ID1_ZEROED], isZeroed: true } },
      city_status: { id1: { ok: true, rows: [CITY_STATUS_ROW_ID1] } },
      region_memberships: {
        id1: { ok: true, rows: [RM_ROW_BASE_1, RM_ROW_MEMBER_1], hasId: false },
      },
      fkRefs: [],
    };
    const r = classifyScenario(findings);
    expect(r.scenario).toBe("D");
    const all = r.reasons.join(" | ");
    expect(all).toMatch(/events sensíveis em city_id=1: 1/);
    expect(all).toMatch(/ads de teste em city_id=1: 2/);
    expect(all).toMatch(/city_metrics city_id=1.*zerada=true/);
    expect(all).toMatch(/city_status city_id=1: 1/);
    expect(all).toMatch(/region_memberships referenciando city_id=1: 2/);
  });

  it("C — region_memberships referenciando id=1 sem evento sensível", () => {
    const findings = {
      events: { id1: { ok: true, rows: [] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [], isZeroed: true } },
      city_status: { id1: { ok: false, missing: true } },
      region_memberships: { id1: { ok: true, rows: [RM_ROW_BASE_1] } },
      fkRefs: [],
    };
    expect(classifyScenario(findings).scenario).toBe("C");
  });

  it("A — só testes + metrics zerada + sem refs fortes", () => {
    const findings = {
      events: { id1: { ok: true, rows: [] } },
      ads: { id1: { ok: true, rows: TEST_ADS_ID1 } },
      city_metrics: { id1: { ok: true, rows: [CITY_METRICS_ROW_ID1_ZEROED], isZeroed: true } },
      city_status: { id1: { ok: false, missing: true } },
      region_memberships: { id1: { ok: true, rows: [] } },
      fkRefs: [],
    };
    expect(classifyScenario(findings).scenario).toBe("A");
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
      city_status: { id1: { ok: false, missing: true } },
      region_memberships: { id1: { ok: true, rows: [] } },
      fkRefs: [],
    };
    expect(classifyScenario(findings).scenario).toBe("B");
  });
});

// ────────────────────────────────────────────────────────────────────
// runAudit — caminho real (schema com advertiser_id, rm sem id)
// ────────────────────────────────────────────────────────────────────

function makeRealSchemaPool({
  cm1Row = CITY_METRICS_ROW_ID1_ZEROED,
  events1 = [PAID_EVENT_ID1],
  rmRows = [RM_ROW_BASE_1, RM_ROW_MEMBER_1],
  cityStatusRows = [CITY_STATUS_ROW_ID1],
  fks = [{ table_name: "ads", column_name: "city_id" }],
} = {}) {
  return makePoolByMatcher([
    // 1) cidades (uma única query especifica WHERE id IN ...)
    { match: /FROM cities\s+WHERE id IN/i, response: { rows: [BROKEN_CITY, CANONICAL_CITY] } },
    // 2) introspecção de schema — precisa diferenciar tabelas pelo $1
    {
      match: /information_schema\.columns\s+WHERE table_name = \$1/i,
      response: ({ params }) => {
        const t = params?.[0];
        if (t === "ads") return { rows: ADS_COLUMNS_REAL };
        if (t === "region_memberships") return { rows: RM_COLUMNS_REAL };
        if (t === "city_status") return { rows: CITY_STATUS_COLUMNS };
        return { rows: [] };
      },
    },
    // 3) ads SELECT (só roda depois da introspecção)
    {
      match: /FROM ads a\s+WHERE a\.city_id = \$1/i,
      response: ({ params }) => {
        if (params?.[0] === 1) return { rows: TEST_ADS_ID1 };
        return { rows: [] };
      },
    },
    // 4) city_metrics SELECT
    {
      match: /FROM city_metrics\s+WHERE city_id = \$1/i,
      response: ({ params }) => {
        if (params?.[0] === 1) return { rows: [cm1Row] };
        return { rows: [] };
      },
    },
    // 5) events SELECT
    {
      match: /FROM events\s+WHERE city_id = \$1/i,
      response: ({ params }) => {
        if (params?.[0] === 1) return { rows: events1 };
        return { rows: [] };
      },
    },
    // 6) region_memberships SELECT (sem id, com ROW_NUMBER)
    {
      match: /FROM region_memberships rm/i,
      response: ({ params }) => {
        if (params?.[0] === 1) return { rows: rmRows };
        return { rows: [] };
      },
    },
    // 7) city_status SELECT
    {
      match: /FROM city_status\s+WHERE city_id = \$1/i,
      response: ({ params }) => {
        if (params?.[0] === 1) return { rows: cityStatusRows };
        return { rows: [] };
      },
    },
    // 8) FKs apontando para cities
    { match: /FROM pg_constraint c/i, response: { rows: fks } },
    // 9) contagem por FK (genérico)
    {
      match: /SUM\(CASE WHEN \w+ = \$1 THEN 1 ELSE 0 END\)::int AS count_id_1/i,
      response: { rows: [{ count_id_1: 2, count_id_5278: 0 }] },
    },
  ]);
}

describe("runAudit — schema real (advertiser_id, rm sem id, métricas zeradas como string)", () => {
  it("identifica id=1 quebrado e id=5278 correto, classifica D com contexto rico", async () => {
    const pg = makeRealSchemaPool();
    const result = await runAudit({ pg, log: () => {} });

    expect(result.findings.cities).toHaveLength(2);
    expect(result.findings.cities.map((c) => c.id).sort((a, b) => a - b)).toEqual([1, 5278]);

    expect(result.findings.ads.id1.ok).toBe(true);
    expect(result.findings.ads.id1.rows).toHaveLength(2);
    expect(result.findings.ads.id1.rows.every((a) => a.parece_teste)).toBe(true);
    expect(result.findings.ads.id1.ownerColumn).toBe("advertiser_id");

    expect(result.findings.events.id1.rows[0].sensivel).toBe(true);

    expect(result.findings.region_memberships.id1.ok).toBe(true);
    expect(result.findings.region_memberships.id1.rows).toHaveLength(2);
    expect(result.findings.region_memberships.id1.hasId).toBe(false);

    expect(result.findings.city_metrics.id1.ok).toBe(true);
    expect(result.findings.city_metrics.id1.isZeroed).toBe(true); // <- bug original FIXADO

    expect(result.findings.city_status.id1.ok).toBe(true);
    expect(result.findings.city_status.id1.rows).toHaveLength(1);

    expect(result.classification.scenario).toBe("D");
    const all = result.classification.reasons.join(" | ");
    expect(all).toMatch(/events sensíveis/);
    expect(all).toMatch(/ads de teste/);
    expect(all).toMatch(/city_metrics.*zerada=true/);
    expect(all).toMatch(/city_status/);
    expect(all).toMatch(/region_memberships/);
  });
});

describe("runAudit — auditAds tolera ausência de user_id", () => {
  it("schema com advertiser_id (sem user_id) NÃO quebra; ownerColumn='advertiser_id'", async () => {
    const pg = makeRealSchemaPool();
    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.ads.id1.ok).toBe(true);
    expect(result.findings.ads.id1.ownerColumn).toBe("advertiser_id");
    // Nenhuma chamada ao pool incluiu "a.user_id"
    for (const c of pg.calls) {
      expect(c.sql).not.toMatch(/\ba\.user_id\b/);
    }
  });

  it("schema só com user_id (sem advertiser_id) → ownerColumn='user_id'", async () => {
    const adsCols = [
      { column_name: "id" },
      { column_name: "title" },
      { column_name: "slug" },
      { column_name: "status" },
      { column_name: "city_id" },
      { column_name: "user_id" },
    ];
    const pg = makePoolByMatcher([
      { match: /FROM cities\s+WHERE id IN/i, response: { rows: [BROKEN_CITY, CANONICAL_CITY] } },
      {
        match: /information_schema\.columns/i,
        response: ({ params }) => {
          if (params?.[0] === "ads") return { rows: adsCols };
          if (params?.[0] === "region_memberships") return { rows: RM_COLUMNS_REAL };
          if (params?.[0] === "city_status") return { rows: [] };
          return { rows: [] };
        },
      },
      {
        match: /FROM ads a/i,
        response: ({ params }) => (params?.[0] === 1 ? { rows: TEST_ADS_ID1 } : { rows: [] }),
      },
      { match: /FROM city_metrics/i, response: { rows: [] } },
      { match: /FROM events/i, response: { rows: [] } },
      { match: /FROM region_memberships rm/i, response: { rows: [] } },
      { match: /FROM city_status/i, response: { rows: [] } },
      { match: /FROM pg_constraint/i, response: { rows: [] } },
    ]);
    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.ads.id1.ownerColumn).toBe("user_id");
  });
});

describe("runAudit — region_memberships sem coluna id", () => {
  it("ROW_NUMBER fallback é usado; rows trazem row_no e dados de base/member", async () => {
    const pg = makeRealSchemaPool();
    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.region_memberships.id1.hasId).toBe(false);
    expect(result.findings.region_memberships.id1.rows[0]).toMatchObject({
      base_city_id: 1,
      member_city_id: 100,
      base_name: "SÆo Paulo",
    });
    // Confirma que NÃO houve SELECT direto de "rm.id"
    for (const c of pg.calls) {
      expect(c.sql).not.toMatch(/SELECT[^F]*rm\.id\b/i);
    }
  });
});

describe("runAudit — city_metrics com numeric vindo como string '0.0000'", () => {
  it("isZeroed=true quando whitelist de métricas == 0 (mesmo que strings)", async () => {
    const pg = makeRealSchemaPool();
    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.city_metrics.id1.isZeroed).toBe(true);
  });

  it("isZeroed=false quando alguma métrica da whitelist tem valor > 0", async () => {
    const cm = { ...CITY_METRICS_ROW_ID1_ZEROED, leads: 17 };
    const pg = makeRealSchemaPool({ cm1Row: cm });
    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.city_metrics.id1.isZeroed).toBe(false);
  });

  it("colunas auxiliares (id/city_id/updated_at) NÃO afetam isZeroed", async () => {
    const cm = {
      ...CITY_METRICS_ROW_ID1_ZEROED,
      id: 99,
      city_id: 1,
      updated_at: "2025-04-01T00:00:00Z",
    };
    const pg = makeRealSchemaPool({ cm1Row: cm });
    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.city_metrics.id1.isZeroed).toBe(true);
  });
});

describe("runAudit — city_status entra no relatório", () => {
  it("city_status referenciando id=1 aparece em findings.city_status.id1.rows", async () => {
    const pg = makeRealSchemaPool();
    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.city_status.id1.ok).toBe(true);
    expect(result.findings.city_status.id1.rows[0]).toMatchObject({
      city_id: 1,
      status: "manual_review",
    });
  });

  it("ausência da tabela city_status não quebra a auditoria", async () => {
    // Override: information_schema retorna [] para city_status
    const pg = makePoolByMatcher([
      { match: /FROM cities\s+WHERE id IN/i, response: { rows: [BROKEN_CITY, CANONICAL_CITY] } },
      {
        match: /information_schema\.columns/i,
        response: ({ params }) => {
          if (params?.[0] === "ads") return { rows: ADS_COLUMNS_REAL };
          if (params?.[0] === "region_memberships") return { rows: RM_COLUMNS_REAL };
          // city_status ausente
          return { rows: [] };
        },
      },
      {
        match: /FROM ads a/i,
        response: ({ params }) => (params?.[0] === 1 ? { rows: TEST_ADS_ID1 } : { rows: [] }),
      },
      { match: /FROM city_metrics/i, response: { rows: [CITY_METRICS_ROW_ID1_ZEROED] } },
      { match: /FROM events/i, response: { rows: [] } },
      { match: /FROM region_memberships rm/i, response: { rows: [] } },
      { match: /FROM city_status/i, response: { rows: [] } },
      { match: /FROM pg_constraint/i, response: { rows: [] } },
    ]);

    const result = await runAudit({ pg, log: () => {} });
    expect(result.findings.city_status.id1.ok).toBe(false);
    expect(result.findings.city_status.id1.missing).toBe(true);
    // ads + metrics + rm continuam ok
    expect(result.findings.ads.id1.ok).toBe(true);
    expect(result.findings.city_metrics.id1.isZeroed).toBe(true);
  });
});
