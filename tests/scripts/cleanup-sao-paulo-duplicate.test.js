import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  closeDatabasePool: vi.fn(async () => {}),
}));

const { runCleanup, planScenario, parseArgs, validatePreconditions } = await import(
  "../../scripts/maintenance/cleanup-sao-paulo-duplicate.mjs"
);

function makeFakePool(responses) {
  const calls = [];
  let i = 0;
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    const next = responses[i++];
    if (next === undefined) return { rows: [], rowCount: 0 };
    if (next instanceof Error) throw next;
    return next;
  });
  return { query, calls, _connectClient: null };
}

function makeFakePoolWithClient(preCheckResponses, transactionResponses = []) {
  // Pool.connect retorna um client com query/release. Usado em --yes.
  const clientCalls = [];
  let txIdx = 0;
  const client = {
    query: vi.fn(async (sql, params) => {
      clientCalls.push({ sql: String(sql).trim(), params });
      const next = transactionResponses[txIdx++];
      if (next === undefined) return { rows: [], rowCount: 0 };
      if (next instanceof Error) throw next;
      return next;
    }),
    release: vi.fn(),
  };

  const poolCalls = [];
  let pcIdx = 0;
  const query = vi.fn(async (sql, params) => {
    poolCalls.push({ sql, params });
    const next = preCheckResponses[pcIdx++];
    if (next === undefined) return { rows: [], rowCount: 0 };
    if (next instanceof Error) throw next;
    return next;
  });

  return {
    query,
    connect: vi.fn(async () => client),
    poolCalls,
    client,
    clientCalls,
  };
}

const BROKEN_OK = {
  rows: [{ id: 1, name: "SÆo Paulo", slug: "sæo-paulo", state: "SP", is_active: true }],
};
const CANONICAL_OK = {
  rows: [{ id: 5278, name: "São Paulo", slug: "sao-paulo-sp", state: "SP" }],
};
const TEST_ADS_OK = {
  rows: [
    { id: 9, title: "Carro teste (seed)", status: "active", city_id: 1 },
    { id: 80, title: "Test Vehicle Test", status: "active", city_id: 1 },
  ],
};
const NO_PAID_EVENTS = { rows: [{ n: 0 }] };
const NO_REGION_MEMBERSHIPS = { rows: [{ n: 0 }] };

describe("parseArgs", () => {
  it("default: dry-run, sem cenário", () => {
    expect(parseArgs(["node", "x.mjs"])).toEqual({ scenario: null, yes: false, dryRun: true });
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
});

describe("planScenario", () => {
  it("archive-test-data: 1 step de UPDATE arquivando ads id IN (9, 80)", () => {
    const steps = planScenario("archive-test-data");
    expect(steps).toHaveLength(1);
    expect(steps[0].sql).toMatch(/UPDATE ads/);
    expect(steps[0].sql).toMatch(/SET status = 'archived'/);
    expect(steps[0].sql).toMatch(/WHERE id = ANY\(\$1::int\[\]\)/);
    expect(steps[0].sql).toMatch(/AND city_id = \$2/);
    expect(steps[0].sql).toMatch(/AND status = 'active'/);
    expect(steps[0].params).toEqual([[9, 80], 1]);
  });

  it("cenário desconhecido → throw", () => {
    expect(() => planScenario("delete-everything")).toThrow(/cenário não suportado/);
  });
});

describe("runCleanup — guards de entrada", () => {
  it("sem --scenario → aborta com missing_scenario, NÃO toca o banco", async () => {
    const pg = makeFakePool([]);
    const result = await runCleanup({ scenario: null, dryRun: true, pg, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_scenario");
    expect(pg.query).not.toHaveBeenCalled();
  });

  it("cenário desconhecido → aborta sem tocar o banco", async () => {
    const pg = makeFakePool([]);
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

describe("runCleanup — dry-run NUNCA escreve", () => {
  it("archive-test-data dry-run com tudo OK: imprime SQL e retorna sem chamar UPDATE", async () => {
    // Sequência das pré-condições: broken → canonical → ads → events → rm
    const pg = makeFakePool([BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, NO_PAID_EVENTS, NO_REGION_MEMBERSHIPS]);
    const log = vi.fn();
    const result = await runCleanup({ scenario: "archive-test-data", dryRun: true, pg, log });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    // Nenhuma das queries chamadas é UPDATE — só SELECTs de pré-condições
    for (const call of pg.query.mock.calls) {
      expect(String(call[0]).toUpperCase()).not.toMatch(/^\s*UPDATE/);
      expect(String(call[0]).toUpperCase()).not.toMatch(/^\s*DELETE/);
      expect(String(call[0]).toUpperCase()).not.toMatch(/^\s*INSERT/);
    }
  });
});

describe("validatePreconditions — garras de segurança", () => {
  it("OK quando broken=sæo-paulo, canonical=sao-paulo-sp, ads esperados active+city_id=1, sem paid events, sem region_memberships", async () => {
    const pg = makeFakePool([BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, NO_PAID_EVENTS, NO_REGION_MEMBERSHIPS]);
    const r = await validatePreconditions({ pg, scenario: "archive-test-data", log: () => {} });
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("FALHA se broken já foi corrigido (slug != 'sæo-paulo')", async () => {
    const fixedBroken = {
      rows: [{ id: 1, name: "São Paulo", slug: "sao-paulo-sp-old", state: "SP", is_active: true }],
    };
    const pg = makeFakePool([fixedBroken, CANONICAL_OK, TEST_ADS_OK, NO_PAID_EVENTS, NO_REGION_MEMBERSHIPS]);
    const r = await validatePreconditions({ pg, scenario: "archive-test-data", log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/já não tem slug='sæo-paulo'/);
  });

  it("FALHA se algum ad esperado já foi arquivado (status != 'active')", async () => {
    const partial = {
      rows: [
        { id: 9, title: "Carro teste", status: "archived", city_id: 1 },
        { id: 80, title: "Test", status: "active", city_id: 1 },
      ],
    };
    const pg = makeFakePool([BROKEN_OK, CANONICAL_OK, partial, NO_PAID_EVENTS, NO_REGION_MEMBERSHIPS]);
    const r = await validatePreconditions({ pg, scenario: "archive-test-data", log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/id=9.*não está active/);
  });

  it("FALHA se evento sensível existir (paid)", async () => {
    const paid = { rows: [{ n: 1 }] };
    const pg = makeFakePool([BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, paid, NO_REGION_MEMBERSHIPS]);
    const r = await validatePreconditions({ pg, scenario: "archive-test-data", log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/events sensíveis em city_id=1/);
  });

  it("FALHA se region_memberships referenciar id=1", async () => {
    const rms = { rows: [{ n: 3 }] };
    const pg = makeFakePool([BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, NO_PAID_EVENTS, rms]);
    const r = await validatePreconditions({ pg, scenario: "archive-test-data", log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/region_memberships referenciando city_id=1/);
  });
});

describe("runCleanup com --yes — bloqueio por segurança", () => {
  it("paid event existe → aborta antes de BEGIN, NÃO conecta cliente", async () => {
    const paid = { rows: [{ n: 1 }] };
    const pg = makeFakePoolWithClient([BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, paid, NO_REGION_MEMBERSHIPS]);

    const result = await runCleanup({ scenario: "archive-test-data", dryRun: false, pg, log: () => {} });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("preconditions_failed");
    expect(result.reasons.join(" ")).toMatch(/events sensíveis/);
    // pool.connect nunca chamado — não abriu transação
    expect(pg.connect).not.toHaveBeenCalled();
  });

  it("region_memberships existe → aborta antes de BEGIN, NÃO conecta cliente", async () => {
    const rms = { rows: [{ n: 2 }] };
    const pg = makeFakePoolWithClient([BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, NO_PAID_EVENTS, rms]);

    const result = await runCleanup({ scenario: "archive-test-data", dryRun: false, pg, log: () => {} });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("preconditions_failed");
    expect(pg.connect).not.toHaveBeenCalled();
  });

  it("estado limpo → executa em transação, commits, retorna totalAffected", async () => {
    const pg = makeFakePoolWithClient(
      [BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, NO_PAID_EVENTS, NO_REGION_MEMBERSHIPS],
      [
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 2 }, // UPDATE → 2 ads arquivados
        { rows: [], rowCount: 0 }, // COMMIT
      ]
    );

    const result = await runCleanup({ scenario: "archive-test-data", dryRun: false, pg, log: () => {} });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.totalAffected).toBe(2);
    expect(pg.client.query).toHaveBeenCalled();
    // Confirma BEGIN e COMMIT vieram em volta do UPDATE
    const sqls = pg.clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    expect(sqls.some((s) => /UPDATE ads/.test(s))).toBe(true);
  });

  it("erro durante UPDATE → ROLLBACK, retorna transaction_error, NÃO commita", async () => {
    const dbError = new Error("constraint violation");
    const pg = makeFakePoolWithClient(
      [BROKEN_OK, CANONICAL_OK, TEST_ADS_OK, NO_PAID_EVENTS, NO_REGION_MEMBERSHIPS],
      [
        { rows: [], rowCount: 0 }, // BEGIN
        dbError, // UPDATE explode
        { rows: [], rowCount: 0 }, // ROLLBACK
      ]
    );

    const result = await runCleanup({ scenario: "archive-test-data", dryRun: false, pg, log: () => {} });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("transaction_error");
    const sqls = pg.clientCalls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
  });
});
