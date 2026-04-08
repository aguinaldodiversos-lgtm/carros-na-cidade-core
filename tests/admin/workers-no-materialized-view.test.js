import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("no worker uses REFRESH MATERIALIZED VIEW for ad_metrics", () => {
  const files = [
    "src/workers/metrics.worker.js",
    "src/modules/growth/growth-brain-pipeline.js",
    "src/brain/engines/growth-brain.engine.js",
    "src/workers/growth_dominance.worker.js",
  ];

  for (const file of files) {
    it(`${file} does NOT contain REFRESH MATERIALIZED VIEW`, () => {
      const code = readFileSync(join(__dirname, "../..", file), "utf-8");
      expect(code).not.toContain("REFRESH MATERIALIZED VIEW");
    });

    it(`${file} imports refreshAdMetricsTable from ad-metrics.refresh.js`, () => {
      const code = readFileSync(join(__dirname, "../..", file), "utf-8");
      expect(code).toContain("ad-metrics.refresh");
    });
  }

  it("ad-metrics.refresh.js uses INSERT INTO ad_metrics ... ON CONFLICT", () => {
    const code = readFileSync(
      join(__dirname, "../../src/workers/ad-metrics.refresh.js"),
      "utf-8"
    );

    expect(code).toContain("INSERT INTO ad_metrics");
    expect(code).toContain("ON CONFLICT (ad_id)");

    const executableLines = code
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
    expect(executableLines).not.toContain("REFRESH MATERIALIZED VIEW");
  });
});
