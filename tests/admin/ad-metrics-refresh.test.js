import { describe, it, expect, vi, beforeEach } from "vitest";

describe("ad-metrics.refresh (TABLE UPSERT decision)", () => {
  let refreshAdMetricsTable;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../src/workers/ad-metrics.refresh.js");
    refreshAdMetricsTable = mod.refreshAdMetricsTable;
  });

  it("exports refreshAdMetricsTable as a function", () => {
    expect(typeof refreshAdMetricsTable).toBe("function");
  });

  it("executes UPSERT SQL (not REFRESH MATERIALIZED VIEW)", async () => {
    const calls = [];
    const mockPool = {
      query: vi.fn((sql) => {
        calls.push(sql);
        return Promise.resolve({ rows: [] });
      }),
    };

    await refreshAdMetricsTable(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const sql = calls[0];

    expect(sql).toContain("INSERT INTO ad_metrics");
    expect(sql).toContain("ON CONFLICT (ad_id)");
    expect(sql).toContain("DO UPDATE SET");
    expect(sql).toContain("FROM ads a");
    expect(sql).toContain("LEFT JOIN ad_events");

    expect(sql).not.toContain("REFRESH MATERIALIZED VIEW");
    expect(sql).not.toContain("MATERIALIZED");
  });

  it("aggregates views, clicks, leads, ctr from ad_events", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await refreshAdMetricsTable(mockPool);

    const sql = mockPool.query.mock.calls[0][0];

    expect(sql).toContain("event_type = 'view'");
    expect(sql).toContain("event_type = 'click'");
    expect(sql).toContain("event_type = 'lead'");
    expect(sql).toContain("ctr");
  });

  it("excludes deleted ads from aggregation", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await refreshAdMetricsTable(mockPool);

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain("status != 'deleted'");
  });
});
