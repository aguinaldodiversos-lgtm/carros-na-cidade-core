import { describe, expect, it } from "vitest";

import { buildBrandEntries, buildModelEntries } from "./territorial-inventory-sitemap.service.js";

describe("buildBrandEntries — sitemap brands a partir de estoque ativo", () => {
  it("slugifica marca e monta loc canônico com lastmod real", () => {
    const entries = buildBrandEntries([
      {
        city_slug: "atibaia-sp",
        state: "SP",
        brand: "Fiat",
        total: 5,
        last_updated: "2026-06-25T10:00:00.000Z",
      },
      {
        city_slug: "atibaia-sp",
        state: "SP",
        brand: "Land Rover",
        total: 1,
        last_updated: "2026-06-20T10:00:00.000Z",
      },
    ]);

    expect(entries).toEqual([
      {
        loc: "/cidade/atibaia-sp/marca/fiat",
        lastmod: "2026-06-25T10:00:00.000Z",
        clusterType: "city_brand",
        state: "SP",
      },
      {
        loc: "/cidade/atibaia-sp/marca/land-rover",
        lastmod: "2026-06-20T10:00:00.000Z",
        clusterType: "city_brand",
        state: "SP",
      },
    ]);
  });

  it("deduplica variações que slugificam igual (soma total, mantém lastmod mais recente)", () => {
    const entries = buildBrandEntries([
      {
        city_slug: "atibaia-sp",
        brand: "Fiat",
        total: 2,
        last_updated: "2026-06-20T00:00:00.000Z",
      },
      {
        city_slug: "atibaia-sp",
        brand: "FIAT",
        total: 3,
        last_updated: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].loc).toBe("/cidade/atibaia-sp/marca/fiat");
    expect(entries[0].lastmod).toBe("2026-06-25T00:00:00.000Z");
  });

  it("descarta linhas sem cidade ou sem marca", () => {
    const entries = buildBrandEntries([
      { city_slug: "", brand: "Fiat", total: 1 },
      { city_slug: "atibaia-sp", brand: "", total: 1 },
    ]);
    expect(entries).toEqual([]);
  });
});

describe("buildModelEntries — sitemap models a partir de estoque ativo", () => {
  it("monta loc cidade/marca/modelo com slugs canônicos", () => {
    const entries = buildModelEntries([
      {
        city_slug: "atibaia-sp",
        state: "SP",
        brand: "Fiat",
        model: "Argo",
        total: 4,
        last_updated: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(entries[0].loc).toBe("/cidade/atibaia-sp/marca/fiat/modelo/argo");
    expect(entries[0].clusterType).toBe("city_brand_model");
  });

  it('não colapsa "Gol" e "Golf" em uma URL', () => {
    const entries = buildModelEntries([
      { city_slug: "atibaia-sp", brand: "Volkswagen", model: "Gol", total: 4 },
      { city_slug: "atibaia-sp", brand: "Volkswagen", model: "Golf", total: 2 },
    ]);
    const locs = entries.map((e) => e.loc).sort();
    expect(locs).toEqual([
      "/cidade/atibaia-sp/marca/volkswagen/modelo/gol",
      "/cidade/atibaia-sp/marca/volkswagen/modelo/golf",
    ]);
  });
});
