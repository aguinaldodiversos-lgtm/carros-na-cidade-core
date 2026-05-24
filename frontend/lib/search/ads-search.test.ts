import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAdsSearchParams, fetchAdsFacets } from "./ads-search";

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: () => "http://api.test",
  getInternalBackendApiBaseUrl: () => null,
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

const mockedFetch = ssrResilientFetch as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  mockedFetch.mockReset();
});

describe("buildAdsSearchParams", () => {
  it("emite city_slugs como CSV quando o array tem múltiplas cidades", () => {
    const params = buildAdsSearchParams({
      city_slugs: ["atibaia-sp", "braganca-paulista-sp", "jundiai-sp"],
    });
    expect(params.get("city_slugs")).toBe("atibaia-sp,braganca-paulista-sp,jundiai-sp");
  });

  it("ignora elementos vazios em city_slugs sem quebrar o restante", () => {
    const params = buildAdsSearchParams({
      city_slugs: ["atibaia-sp", "  ", ""],
    });
    expect(params.get("city_slugs")).toBe("atibaia-sp");
  });
});

describe("fetchAdsFacets — regressão 2026-05-24", () => {
  it("propaga city_slugs para o backend (fix do regional sem facets)", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
      }),
    } as unknown as Response);

    await fetchAdsFacets({
      city_slugs: ["atibaia-sp", "jundiai-sp"],
      state: "SP",
    });

    expect(mockedFetch).toHaveBeenCalledOnce();
    const url = String(mockedFetch.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("city_slugs=atibaia-sp%2Cjundiai-sp");
    expect(url).toContain("state=SP");
  });

  it("ainda funciona com city_slug singular (compat retroativa)", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
      }),
    } as unknown as Response);

    await fetchAdsFacets({ city_slug: "campinas-sp" });

    const url = String(mockedFetch.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("city_slug=campinas-sp");
    expect(url).not.toContain("city_slugs=");
  });
});
