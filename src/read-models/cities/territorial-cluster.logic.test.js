import { describe, expect, it } from "vitest";

import {
  titleizeSlug,
  matchRowsBySlug,
  aggregateMatchedRows,
  buildClusterSeo,
} from "./territorial-cluster.logic.js";

describe("titleizeSlug", () => {
  it.each([
    ["land-rover", "Land Rover"],
    ["fiat", "Fiat"],
    ["hb-20", "Hb 20"],
    ["", ""],
  ])("'%s' → '%s'", (slug, expected) => {
    expect(titleizeSlug(slug)).toBe(expected);
  });
});

describe("matchRowsBySlug — resolve slug → valor real (exato, nunca substring)", () => {
  const brandRows = [
    { brand: "Fiat", total: 5 },
    { brand: "Volkswagen", total: 3 },
    { brand: "Land Rover", total: 1 },
  ];

  it("'fiat' resolve para a linha 'Fiat'", () => {
    expect(matchRowsBySlug(brandRows, "fiat", "brand")).toEqual([{ brand: "Fiat", total: 5 }]);
  });

  it("'land-rover' resolve para 'Land Rover' (corrige bug de espaço/acentos)", () => {
    expect(matchRowsBySlug(brandRows, "land-rover", "brand")).toEqual([
      { brand: "Land Rover", total: 1 },
    ]);
  });

  it("'gol' NÃO resolve para 'Golf' (sem substring)", () => {
    const modelRows = [
      { model: "Gol", total: 4 },
      { model: "Golf", total: 2 },
    ];
    expect(matchRowsBySlug(modelRows, "gol", "model")).toEqual([{ model: "Gol", total: 4 }]);
  });

  it("slug inexistente → []", () => {
    expect(matchRowsBySlug(brandRows, "ferrari", "brand")).toEqual([]);
  });
});

describe("aggregateMatchedRows", () => {
  it("soma totais, recomputa média ponderada e escolhe rótulo de maior volume", () => {
    const rows = [
      {
        brand: "Fiat",
        total: 2,
        highlight: 1,
        below_fipe: 1,
        sum_price: 100000,
        min_price: 40000,
        max_price: 60000,
        last_updated: "2026-06-20T00:00:00.000Z",
      },
      {
        brand: "FIAT",
        total: 3,
        highlight: 0,
        below_fipe: 0,
        sum_price: 150000,
        min_price: 30000,
        max_price: 70000,
        last_updated: "2026-06-25T00:00:00.000Z",
      },
    ];

    const agg = aggregateMatchedRows(rows, { labelKey: "brand", slug: "fiat" });

    expect(agg.activeCount).toBe(5);
    expect(agg.hasActiveInventory).toBe(true);
    expect(agg.label).toBe("FIAT"); // maior volume (3 > 2)
    expect(agg.stats.minPrice).toBe(30000);
    expect(agg.stats.maxPrice).toBe(70000);
    expect(agg.stats.avgPrice).toBe(Math.round(250000 / 5)); // 50000 ponderado
    expect(agg.lastUpdated).toBe("2026-06-25T00:00:00.000Z");
    expect(agg.values).toEqual(["Fiat", "FIAT"]);
  });

  it("sem matches → activeCount 0, hasActiveInventory false, label = titleize(slug)", () => {
    const agg = aggregateMatchedRows([], { labelKey: "brand", slug: "land-rover" });
    expect(agg.activeCount).toBe(0);
    expect(agg.hasActiveInventory).toBe(false);
    expect(agg.label).toBe("Land Rover");
    expect(agg.stats.avgPrice).toBe(null);
  });
});

describe("buildClusterSeo — robots dinâmico por estoque", () => {
  it("activeCount >= 1 → index,follow", () => {
    const seo = buildClusterSeo({
      canonicalPath: "/cidade/atibaia-sp/marca/fiat",
      title: "Fiat em Atibaia",
      description: "...",
      activeCount: 3,
    });
    expect(seo.robots).toBe("index,follow");
    expect(seo.indexable).toBe(true);
    expect(seo.hasActiveInventory).toBe(true);
    expect(seo.activeCount).toBe(3);
    expect(seo.noindexReason).toBe(null);
    expect(seo.canonicalPath).toBe("/cidade/atibaia-sp/marca/fiat");
  });

  it("activeCount = 0 → noindex,follow + reason no_active_inventory", () => {
    const seo = buildClusterSeo({
      canonicalPath: "/cidade/atibaia-sp/marca/ferrari",
      title: "Ferrari em Atibaia",
      description: "...",
      activeCount: 0,
    });
    expect(seo.robots).toBe("noindex,follow");
    expect(seo.indexable).toBe(false);
    expect(seo.hasActiveInventory).toBe(false);
    expect(seo.noindexReason).toBe("no_active_inventory");
    // nunca canonicaliza para home
    expect(seo.canonicalPath).not.toBe("/");
  });
});
