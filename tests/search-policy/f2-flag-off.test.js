// tests/search-policy/f2-flag-off.test.js
//
// 8.8 — flag `off`: o SQL do caminho legado é IDÊNTICO ao de `main` antes da
// F2, nos 24 contextos fixos. O golden foi gerado a partir de uma cópia do
// ads-filter.builder.js de main (git show main:…), não do arquivo atual.
// Também: o controller não chama o motor com a flag off; chama com v1 quando a
// origem está na allowlist; agenda o shadow depois da resposta.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";
import { LEGACY_CONTEXTS } from "./helpers/contexts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(
  fs.readFileSync(path.join(here, "__snapshots__/legacy-sql.golden.json"), "utf8")
);

describe("8.8 — flag off: SQL legado byte a byte igual ao de main (24 contextos)", () => {
  it("dataQuery, countQuery, params e countParams idênticos ao golden", () => {
    expect(Object.keys(GOLDEN).length).toBe(24);
    for (const c of LEGACY_CONTEXTS) {
      const q = buildAdsSearchQuery(c.filters);
      const g = GOLDEN[c.key];
      expect(q.dataQuery, `${c.key} dataQuery`).toBe(g.dataQuery);
      expect(q.countQuery, `${c.key} countQuery`).toBe(g.countQuery);
      expect(q.params, `${c.key} params`).toEqual(g.params);
      expect(q.countParams, `${c.key} countParams`).toEqual(g.countParams);
    }
  });
});

vi.mock("../../src/modules/ads/filters/ads-filter.parser.js", () => ({
  parseAdsFilters: vi.fn(async (q) => ({ ...q, page: 1, limit: 20, sort: "relevance" })),
  parseAdsFacetFilters: vi.fn(async (q) => q),
}));
vi.mock("../../src/modules/ads/ads.service.js", () => ({
  search: vi.fn(async () => ({ ok: true, data: [{ id: 1 }], pagination: { total: 1 } })),
  list: vi.fn(),
  show: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../src/modules/ads/search-policy/engine.js", () => ({
  runSearchPolicyEngineIfAllowed: vi.fn(async () => null),
  runShadowComparison: vi.fn(async () => ({})),
}));
vi.mock("../../src/modules/ads/ads.mutation-cache.js", () => ({
  invalidateAdsCachesAfterMutation: vi.fn(),
}));
vi.mock("../../src/modules/ads/facets.service.js", () => ({ getFacets: vi.fn() }));
vi.mock("../../src/modules/ads/ads.publication-options.service.js", () => ({
  getPublicationOptions: vi.fn(),
}));
vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({ uploadVehicleImages: vi.fn() }));

import { search } from "../../src/modules/ads/ads.controller.js";
import * as engine from "../../src/modules/ads/search-policy/engine.js";
import * as adsService from "../../src/modules/ads/ads.service.js";

function fakeRes() {
  const res = { body: null, json: vi.fn((b) => (res.body = b)), status: vi.fn(() => res) };
  return res;
}

describe("8.8 — controller por modo da flag", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.mocked(engine.runSearchPolicyEngineIfAllowed).mockClear();
    vi.mocked(engine.runShadowComparison).mockClear();
    vi.mocked(adsService.search).mockClear();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("off: motor nunca é chamado; resposta legada", async () => {
    process.env.SEARCH_POLICY_ENGINE = "off";
    const res = fakeRes();
    await search(
      { query: { city_slug: "atibaia-sp" }, originalUrl: "/api/ads/search" },
      res,
      vi.fn()
    );
    expect(engine.runSearchPolicyEngineIfAllowed).not.toHaveBeenCalled();
    expect(engine.runShadowComparison).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ success: true, ok: true, data: [{ id: 1 }] });
  });

  it("shadow: resposta legada primeiro, shadow agendado depois com o resultado legado", async () => {
    process.env.SEARCH_POLICY_ENGINE = "shadow";
    const res = fakeRes();
    await search(
      { query: { city_slug: "atibaia-sp" }, originalUrl: "/api/ads/search?x" },
      res,
      vi.fn()
    );
    expect(res.body.data).toEqual([{ id: 1 }]);
    expect(engine.runSearchPolicyEngineIfAllowed).not.toHaveBeenCalled();
    expect(engine.runShadowComparison).toHaveBeenCalledTimes(1);
    const [q, legacy, opts] = vi.mocked(engine.runShadowComparison).mock.calls[0];
    expect(q).toEqual({ city_slug: "atibaia-sp" });
    expect(legacy).toMatchObject({ pagination: { total: 1 } });
    expect(opts.path).toBe("/api/ads/search?x");
  });

  it("v1: motor responde quando permitido; fora da allowlist cai no legado", async () => {
    process.env.SEARCH_POLICY_ENGINE = "v1";
    vi.mocked(engine.runSearchPolicyEngineIfAllowed).mockResolvedValueOnce({
      ok: true,
      data: [],
      search_policy: { version: "v1" },
    });
    const res = fakeRes();
    await search(
      { query: { city_slug: "atibaia-sp" }, originalUrl: "/api/ads/search" },
      res,
      vi.fn()
    );
    expect(res.body).toMatchObject({ success: true, search_policy: { version: "v1" } });
    expect(adsService.search).not.toHaveBeenCalled();

    vi.mocked(engine.runSearchPolicyEngineIfAllowed).mockResolvedValueOnce(null);
    const res2 = fakeRes();
    await search({ query: { city_slug: "outra" }, originalUrl: "/api/ads/search" }, res2, vi.fn());
    expect(res2.body).toMatchObject({ data: [{ id: 1 }] });
    expect(adsService.search).toHaveBeenCalledTimes(1);
  });

  it("v1: erro inesperado do motor → resposta legada (nunca pior do que hoje)", async () => {
    process.env.SEARCH_POLICY_ENGINE = "v1";
    vi.mocked(engine.runSearchPolicyEngineIfAllowed).mockRejectedValueOnce(new Error("boom"));
    const res = fakeRes();
    const next = vi.fn();
    await search({ query: { city_slug: "atibaia-sp" }, originalUrl: "/api/ads/search" }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ data: [{ id: 1 }] });
  });
});
