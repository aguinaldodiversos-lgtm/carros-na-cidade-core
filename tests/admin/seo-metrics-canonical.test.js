import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import { getSeoCityMetrics } from "../../src/modules/admin/metrics/admin-metrics.repository.js";

describe("seo_city_metrics canonical decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("migration 015 creates seo_city_metrics with (date, city) PK", () => {
    const sql = readFileSync(
      join(__dirname, "../../src/database/migrations/015_seo_city_metrics_canonical.sql"),
      "utf-8"
    );

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS seo_city_metrics");
    expect(sql).toContain("PRIMARY KEY (date, city)");
    expect(sql).toContain("impressions");
    expect(sql).toContain("clicks");
    expect(sql).toContain("sessions");
    expect(sql).toContain("users_count");
    expect(sql).toContain("conversions");
    expect(sql).toContain("source");
  });

  it("migration 015 creates backward-compatible city_seo_metrics VIEW", () => {
    const sql = readFileSync(
      join(__dirname, "../../src/database/migrations/015_seo_city_metrics_canonical.sql"),
      "utf-8"
    );

    expect(sql).toContain("city_seo_metrics");
    expect(sql).toContain("CREATE VIEW");
  });

  it("admin repository queries seo_city_metrics directly (not city_seo_metrics)", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        { date: "2026-04-07", city: "São Paulo", impressions: 100, clicks: 10 },
      ],
    });

    const result = await getSeoCityMetrics({ limit: 10 });

    expect(query).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(query).mock.calls[0][0];

    expect(sql).toContain("seo_city_metrics");
    expect(sql).not.toContain("city_seo_metrics");
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe("São Paulo");
  });

  it("returns empty array on fresh environment (table empty)", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] });

    const result = await getSeoCityMetrics({ limit: 30 });
    expect(result).toEqual([]);
  });

  it("returns empty array when table doesn't exist (catches error)", async () => {
    vi.mocked(query).mockRejectedValue(new Error("relation does not exist"));

    const result = await getSeoCityMetrics({ limit: 30 });
    expect(result).toEqual([]);
  });
});

describe("legacy workers now write to seo_city_metrics", () => {
  it("dataCollector.worker.js uses seo_city_metrics", () => {
    const code = readFileSync(
      join(__dirname, "../../src/workers/dataCollector.worker.js"),
      "utf-8"
    );

    expect(code).toContain("INSERT INTO seo_city_metrics");
    expect(code).not.toContain("INSERT INTO city_seo_metrics");
  });

  it("seoCollector.worker.js uses seo_city_metrics", () => {
    const code = readFileSync(
      join(__dirname, "../../src/modules/external/seoCollector.worker.js"),
      "utf-8"
    );

    expect(code).toContain("INSERT INTO seo_city_metrics");
    expect(code).not.toContain("INSERT INTO city_seo_metrics");
  });

  it("searchConsole.service.js fallback uses seo_city_metrics", () => {
    const code = readFileSync(
      join(__dirname, "../../src/modules/external/searchConsole.service.js"),
      "utf-8"
    );

    expect(code).toContain("FROM seo_city_metrics");
    expect(code).not.toContain("FROM city_seo_metrics");
  });

  it("ga4.service.js fallback uses seo_city_metrics", () => {
    const code = readFileSync(
      join(__dirname, "../../src/modules/external/ga4.service.js"),
      "utf-8"
    );

    expect(code).toContain("FROM seo_city_metrics");
    expect(code).not.toContain("FROM city_seo_metrics");
  });
});
