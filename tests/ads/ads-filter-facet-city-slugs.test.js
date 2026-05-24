import { describe, expect, it } from "vitest";

import { buildAdsFacetWhere } from "../../src/modules/ads/filters/ads-filter.builder.js";
import { AdsFacetFilterSchema } from "../../src/modules/ads/filters/ads-filter.schema.js";

function normalize(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("buildAdsFacetWhere — propagação de city_slugs (fix 2026-05-24)", () => {
  it("emite c.slug = ANY($n) quando city_slugs vem na regional", () => {
    const out = buildAdsFacetWhere({
      city_slugs: ["atibaia-sp", "braganca-paulista-sp"],
    });
    const sql = normalize(out.whereClause);

    expect(sql).toContain("c.slug = ANY($1)");
    expect(out.params[0]).toEqual(["atibaia-sp", "braganca-paulista-sp"]);
  });

  it("emite city_slugs + state combinados (safety net)", () => {
    const out = buildAdsFacetWhere({
      city_slugs: ["atibaia-sp"],
      state: "SP",
    });
    const sql = normalize(out.whereClause);

    expect(sql).toContain("c.slug = ANY($1)");
    expect(sql).toContain("UPPER(COALESCE(a.state, c.state)) = $2");
    expect(out.params).toEqual([["atibaia-sp"], "SP"]);
  });

  it("city_slug singular sempre precede city_slugs", () => {
    const out = buildAdsFacetWhere({
      city_slug: "campinas-sp",
      city_slugs: ["jundiai-sp"],
    });
    const sql = normalize(out.whereClause);

    expect(sql).toContain("c.slug = $1");
    expect(sql).not.toContain("ANY(");
    expect(out.params[0]).toBe("campinas-sp");
  });
});

describe("AdsFacetFilterSchema — aceita city_slugs explicitamente", () => {
  it("expõe city_slugs no shape (não só via passthrough)", () => {
    const parsed = AdsFacetFilterSchema.parse({
      city_slugs: "atibaia-sp,jundiai-sp",
    });
    expect(parsed.city_slugs).toEqual(["atibaia-sp", "jundiai-sp"]);
  });
});
