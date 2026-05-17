import { describe, expect, it } from "vitest";

import {
  buildArchiveUpdateQuery,
  buildInventoryQueries,
  buildSnapshotEntry,
  buildSnapshotSelectQuery,
  computeInventoryAlerts,
} from "../../scripts/cleanup/lib/archive-helpers.mjs";

describe("buildSnapshotSelectQuery — SELECT do snapshot pré-update", () => {
  const baseAvailable = new Set(["id", "status", "title", "slug", "city_id", "state", "created_at"]);

  it("monta SELECT com colunas presentes + WHERE id=ANY + status filter", () => {
    const { sql, params, present } = buildSnapshotSelectQuery({
      candidateIds: [1, 2, 3],
      fromStatus: "active",
      availableColumns: baseAvailable,
    });
    expect(sql).toContain("FROM ads");
    expect(sql).toContain("WHERE id = ANY($1::bigint[])");
    expect(sql).toContain("status = $2");
    expect(params).toEqual([[1, 2, 3], "active"]);
    expect(present).toEqual(["id", "status", "title", "slug", "city_id", "state", "created_at"]);
  });

  it("ORDER BY id ASC para snapshot determinístico", () => {
    const { sql } = buildSnapshotSelectQuery({
      candidateIds: [3, 1, 2],
      fromStatus: "active",
      availableColumns: baseAvailable,
    });
    expect(sql).toMatch(/ORDER BY id ASC/);
  });

  it("colunas ausentes (city_id, state) são omitidas — sem quebrar", () => {
    const available = new Set(["id", "status", "title", "slug"]);
    const { present, sql } = buildSnapshotSelectQuery({
      candidateIds: [1],
      fromStatus: "active",
      availableColumns: available,
    });
    expect(present).toEqual(["id", "status", "title", "slug"]);
    expect(sql).not.toMatch(/\bcity_id\b/);
    expect(sql).not.toMatch(/\bstate\b/);
  });

  it("erro quando id ou status ausente", () => {
    expect(() =>
      buildSnapshotSelectQuery({
        candidateIds: [1],
        fromStatus: "active",
        availableColumns: new Set(["title", "slug"]),
      })
    ).toThrow(/'id' e 'status'/);
  });

  it("erro quando candidateIds vazio", () => {
    expect(() =>
      buildSnapshotSelectQuery({
        candidateIds: [],
        fromStatus: "active",
        availableColumns: baseAvailable,
      })
    ).toThrow(/vazio/);
  });

  it("erro quando availableColumns não é Set", () => {
    expect(() =>
      buildSnapshotSelectQuery({
        candidateIds: [1],
        fromStatus: "active",
        availableColumns: ["id", "status"],
      })
    ).toThrow(/Set/);
  });
});

describe("buildArchiveUpdateQuery — UPDATE seguro", () => {
  it("UPDATE com WHERE id=ANY + status filter + RETURNING", () => {
    const { sql, params } = buildArchiveUpdateQuery({
      candidateIds: [10, 20],
      fromStatus: "active",
      toStatus: "archived_test",
    });
    expect(sql).toMatch(/^UPDATE ads/);
    expect(sql).toContain("SET status = $3");
    expect(sql).toContain("WHERE id = ANY($1::bigint[])");
    expect(sql).toContain("AND status = $2");
    expect(sql).toContain("RETURNING id, status");
    expect(params).toEqual([[10, 20], "active", "archived_test"]);
  });

  it("NUNCA contém DELETE", () => {
    const { sql } = buildArchiveUpdateQuery({
      candidateIds: [1],
      fromStatus: "active",
      toStatus: "archived_test",
    });
    expect(sql.toUpperCase()).not.toContain("DELETE");
  });

  it("erro se fromStatus == toStatus (no-op)", () => {
    expect(() =>
      buildArchiveUpdateQuery({
        candidateIds: [1],
        fromStatus: "active",
        toStatus: "active",
      })
    ).toThrow(/no-op/);
  });

  it("erro se fromStatus ausente", () => {
    expect(() =>
      buildArchiveUpdateQuery({
        candidateIds: [1],
        fromStatus: "",
        toStatus: "archived_test",
      })
    ).toThrow(/obrigatórios/);
  });

  it("erro se candidateIds vazio (evita UPDATE em tabela inteira)", () => {
    expect(() =>
      buildArchiveUpdateQuery({
        candidateIds: [],
        fromStatus: "active",
        toStatus: "archived_test",
      })
    ).toThrow(/vazio/);
  });
});

describe("buildInventoryQueries — total + por estado + por cidade", () => {
  const baseAvailable = new Set(["id", "status", "state", "city_id"]);

  it("sem excludeIds, query simples WHERE status='active'", () => {
    const { total, byState, byCity } = buildInventoryQueries({
      availableColumns: baseAvailable,
    });
    expect(total.sql).toContain("WHERE status = 'active'");
    expect(total.params).toEqual([]);
    expect(byState.sql).toContain("GROUP BY state");
    expect(byCity.sql).toContain("LEFT JOIN cities");
  });

  it("com excludeIds, adiciona NOT id=ANY", () => {
    const { total, byState } = buildInventoryQueries({
      excludeIds: [1, 2, 3],
      availableColumns: baseAvailable,
    });
    expect(total.sql).toContain("NOT (id = ANY($1::bigint[]))");
    expect(total.params).toEqual([[1, 2, 3]]);
    expect(byState.params).toEqual([[1, 2, 3]]);
  });

  it("sem coluna 'state', byState é null", () => {
    const available = new Set(["id", "status"]);
    const { byState } = buildInventoryQueries({ availableColumns: available });
    expect(byState).toBeNull();
  });

  it("sem coluna 'city_id', byCity é null", () => {
    const available = new Set(["id", "status", "state"]);
    const { byCity } = buildInventoryQueries({ availableColumns: available });
    expect(byCity).toBeNull();
  });

  it("erro quando status ausente", () => {
    expect(() =>
      buildInventoryQueries({ availableColumns: new Set(["id"]) })
    ).toThrow(/'status'/);
  });
});

describe("computeInventoryAlerts — guardrails de inventário", () => {
  it("zero ativos pós-cleanup → alerta crítico", () => {
    const alerts = computeInventoryAlerts({
      totalActiveAfter: 0,
      minRemainingActive: 10,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatch(/ZERADO/i);
    expect(alerts[0]).toMatch(/Não ativar SEO/i);
  });

  it("menos que min (PR 7 caso real: 1 ativo, min=10) → alerta", () => {
    const alerts = computeInventoryAlerts({
      totalActiveAfter: 1,
      minRemainingActive: 10,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatch(/restarão apenas 1 anúncio/i);
    expect(alerts[0]).toMatch(/popular inventário real/i);
  });

  it("acima do min → sem alerta", () => {
    expect(computeInventoryAlerts({ totalActiveAfter: 50, minRemainingActive: 10 })).toEqual([]);
  });

  it("exatamente no min → sem alerta (estritamente menor)", () => {
    expect(computeInventoryAlerts({ totalActiveAfter: 10, minRemainingActive: 10 })).toEqual([]);
  });
});

describe("buildSnapshotEntry", () => {
  it("preserva colunas com defaults null + adiciona reason/timestamp", () => {
    const row = { id: 1, status: "active", title: "Civic" };
    const entry = buildSnapshotEntry({
      row,
      reason: "test_ad_suspect:high",
      archiveTimestamp: "2026-05-16T00:00:00.000Z",
    });
    expect(entry).toEqual({
      id: 1,
      previous_status: "active",
      title: "Civic",
      slug: null,
      city_id: null,
      state: null,
      created_at: null,
      archive_reason: "test_ad_suspect:high",
      archive_timestamp: "2026-05-16T00:00:00.000Z",
    });
  });

  it("fallback de reason quando vazio", () => {
    const entry = buildSnapshotEntry({ row: { id: 1, status: "active" } });
    expect(entry.archive_reason).toBe("test_ad_suspect:high");
  });
});
