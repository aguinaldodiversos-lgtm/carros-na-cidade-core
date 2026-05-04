import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock do pool ANTES de importar o módulo sob teste — vi.mock é hoisted.
vi.mock("../../../infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
}));

const { pool } = await import("../../../infrastructure/database/db.js");
const { listTopCitiesForClusterPlanning, __TEST_ONLY__ } = await import(
  "./cluster-planner.repository.js"
);

const ATIBAIA_PRIMARY_ROW = {
  city_id: 4761,
  name: "Atibaia",
  state: "SP",
  slug: "atibaia-sp",
  stage: "expansion",
  territorial_score: 87,
  ranking_priority: 92,
  total_ads: 420,
  total_leads: 18,
};

const BRAGANCA_PRIMARY_ROW = {
  city_id: 4762,
  name: "Bragança Paulista",
  state: "SP",
  slug: "braganca-paulista-sp",
  stage: "discovery",
  territorial_score: 71,
  ranking_priority: 80,
  total_ads: 310,
  total_leads: 12,
};

const ATIBAIA_FALLBACK_ROW = {
  city_id: 4761,
  name: "Atibaia",
  state: "SP",
  slug: "atibaia-sp",
  stage: "seed",
  active_ads: 4,
};

const BRAGANCA_FALLBACK_ROW = {
  city_id: 4762,
  name: "Bragança Paulista",
  state: "SP",
  slug: "braganca-paulista-sp",
  stage: "seed",
  active_ads: 3,
};

beforeEach(() => {
  pool.query.mockReset();
});

afterEach(() => {
  pool.query.mockReset();
});

describe("listTopCitiesForClusterPlanning — fonte primária (city_scores)", () => {
  it("usa city_scores quando há linhas e NÃO chama o fallback", async () => {
    pool.query.mockResolvedValueOnce({ rows: [ATIBAIA_PRIMARY_ROW, BRAGANCA_PRIMARY_ROW] });

    const result = await listTopCitiesForClusterPlanning(10);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toBe(__TEST_ONLY__.SQL_PRIMARY);
    expect(pool.query.mock.calls[0][1]).toEqual([10]);
    expect(result).toEqual([ATIBAIA_PRIMARY_ROW, BRAGANCA_PRIMARY_ROW]);
  });

  it("preserva o stage original vindo de city_scores (não força 'seed')", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { ...ATIBAIA_PRIMARY_ROW, stage: "dominance" },
        { ...BRAGANCA_PRIMARY_ROW, stage: "expansion" },
      ],
    });

    const result = await listTopCitiesForClusterPlanning(10);

    expect(result.map((r) => r.stage)).toEqual(["dominance", "expansion"]);
  });

  it("respeita o limit (clampa em [1, 2000])", async () => {
    pool.query.mockResolvedValueOnce({ rows: [ATIBAIA_PRIMARY_ROW] });
    await listTopCitiesForClusterPlanning(99999);
    expect(pool.query.mock.calls[0][1]).toEqual([2000]);

    pool.query.mockReset();
    pool.query.mockResolvedValueOnce({ rows: [ATIBAIA_PRIMARY_ROW] });
    await listTopCitiesForClusterPlanning(0);
    expect(pool.query.mock.calls[0][1]).toEqual([200]); // 0 cai no default

    pool.query.mockReset();
    pool.query.mockResolvedValueOnce({ rows: [ATIBAIA_PRIMARY_ROW] });
    await listTopCitiesForClusterPlanning(-5);
    expect(pool.query.mock.calls[0][1]).toEqual([1]);
  });
});

describe("listTopCitiesForClusterPlanning — fallback (ads + cities)", () => {
  it("aciona fallback quando city_scores retorna []", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // primary
      .mockResolvedValueOnce({ rows: [ATIBAIA_FALLBACK_ROW, BRAGANCA_FALLBACK_ROW] }); // fallback

    const result = await listTopCitiesForClusterPlanning(10);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toBe(__TEST_ONLY__.SQL_PRIMARY);
    expect(pool.query.mock.calls[1][0]).toBe(__TEST_ONLY__.SQL_FALLBACK_ADS);
    expect(pool.query.mock.calls[1][1]).toEqual([10]);

    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe("atibaia-sp");
    expect(result[1].slug).toBe("braganca-paulista-sp");
  });

  it("fallback retorna shape compatível com city_scores (mesmas chaves)", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ATIBAIA_FALLBACK_ROW] });

    const result = await listTopCitiesForClusterPlanning(10);

    const expectedKeys = [
      "city_id",
      "name",
      "state",
      "slug",
      "stage",
      "territorial_score",
      "ranking_priority",
      "total_ads",
      "total_leads",
    ].sort();

    expect(Object.keys(result[0]).sort()).toEqual(expectedKeys);
  });

  it("fallback marca todas as cidades com stage='seed'", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ATIBAIA_FALLBACK_ROW, BRAGANCA_FALLBACK_ROW] });

    const result = await listTopCitiesForClusterPlanning(10);

    expect(result.map((r) => r.stage)).toEqual(["seed", "seed"]);
  });

  it("fallback usa active_ads como territorial_score / ranking_priority / total_ads (proxy)", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ATIBAIA_FALLBACK_ROW] });

    const [row] = await listTopCitiesForClusterPlanning(10);

    expect(row.territorial_score).toBe(4);
    expect(row.ranking_priority).toBe(4);
    expect(row.total_ads).toBe(4);
    expect(row.total_leads).toBe(0);
  });

  it("fallback preserva ordem do SQL (DESC active_ads); o repo NÃO reordena", async () => {
    // SQL faz ORDER BY COUNT(a.id) DESC; aqui simulamos o resultado já ordenado.
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          ATIBAIA_FALLBACK_ROW, // 4 ads
          BRAGANCA_FALLBACK_ROW, // 3 ads
        ],
      });

    const result = await listTopCitiesForClusterPlanning(10);
    expect(result[0].city_id).toBe(4761);
    expect(result[1].city_id).toBe(4762);
  });

  it("retorna [] quando ambas primary e fallback retornam [] (sem ads ativos)", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listTopCitiesForClusterPlanning(10);
    expect(result).toEqual([]);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});

describe("listTopCitiesForClusterPlanning — invariantes read-only", () => {
  it("nunca emite INSERT/UPDATE/DELETE — apenas SELECT", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ATIBAIA_FALLBACK_ROW] });

    await listTopCitiesForClusterPlanning(10);

    for (const call of pool.query.mock.calls) {
      const sql = String(call[0]).toUpperCase();
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE)\b/);
      expect(sql).toMatch(/^\s*SELECT\b/);
    }
  });

  it("SQL fallback tem cláusula que exclui slug NULL e slug vazio", () => {
    const sql = __TEST_ONLY__.SQL_FALLBACK_ADS;
    expect(sql).toMatch(/c\.slug IS NOT NULL/);
    expect(sql).toMatch(/c\.slug <> ''/);
  });

  it("SQL fallback exige a.status = 'active' e a.city_id IS NOT NULL", () => {
    const sql = __TEST_ONLY__.SQL_FALLBACK_ADS;
    expect(sql).toMatch(/a\.status = 'active'/);
    expect(sql).toMatch(/a\.city_id IS NOT NULL/);
  });
});

describe("projectFallbackRow — mapping defensivo", () => {
  it("trata active_ads não-numérico como 0", () => {
    const row = __TEST_ONLY__.projectFallbackRow({
      city_id: 1,
      name: "X",
      state: "SP",
      slug: "x",
      stage: "seed",
      active_ads: "abc",
    });
    expect(row.territorial_score).toBe(0);
    expect(row.ranking_priority).toBe(0);
    expect(row.total_ads).toBe(0);
  });

  it("default de stage é 'seed' se ausente", () => {
    const row = __TEST_ONLY__.projectFallbackRow({
      city_id: 1,
      name: "X",
      state: "SP",
      slug: "x",
      active_ads: 5,
    });
    expect(row.stage).toBe("seed");
  });
});
