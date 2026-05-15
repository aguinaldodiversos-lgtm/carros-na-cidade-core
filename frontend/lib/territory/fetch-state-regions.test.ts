import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: vi.fn(),
  resolveBackendApiUrl: vi.fn(),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import {
  getBackendApiBaseUrl,
  resolveBackendApiUrl,
} from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

import { fetchStateRegions } from "./fetch-state-regions";

const mockedBase = vi.mocked(getBackendApiBaseUrl);
const mockedResolve = vi.mocked(resolveBackendApiUrl);
const mockedFetch = vi.mocked(ssrResilientFetch);

function buildResponse(status: number, body: unknown): Response {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      state: { code: "SP", slug: "sp" },
      regions: [
        {
          slug: "atibaia-sp",
          name: "Região de Atibaia",
          baseCitySlug: "atibaia-sp",
          baseCityName: "Atibaia",
          href: "/carros-usados/regiao/atibaia-sp",
          cityNames: ["Atibaia", "Itatiba"],
          citySlugs: ["atibaia-sp", "itatiba-sp"],
          adsCount: 12,
          featuredCount: 2,
          radiusKm: 80,
        },
      ],
      ...overrides,
    },
  };
}

beforeEach(() => {
  mockedBase.mockReturnValue("https://backend.example.com");
  mockedResolve.mockImplementation((p: string) => `https://backend.example.com${p}`);
  mockedFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchStateRegions — validação de UF antes do fetch", () => {
  it("UF vazia → null sem fetch", async () => {
    const result = await fetchStateRegions("");
    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("UF com 1 letra → null sem fetch", async () => {
    const result = await fetchStateRegions("X");
    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("backend base URL ausente → null silencioso", async () => {
    mockedBase.mockReturnValue("");
    const result = await fetchStateRegions("SP");
    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe("fetchStateRegions — cache + headers", () => {
  it("propaga revalidate=300 e tags ['public:state-regions', 'public:state-regions:SP']", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildPayload()));

    await fetchStateRegions("SP");

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, opts] = mockedFetch.mock.calls[0];
    expect(opts?.next).toEqual({
      revalidate: 300,
      tags: ["public:state-regions", "public:state-regions:SP"],
    });
    expect(opts?.logTag).toBe("state-regions:bff");
  });

  it("UF lowercase no path da URL", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildPayload()));

    await fetchStateRegions("SP");
    const [url] = mockedFetch.mock.calls[0];
    expect(String(url)).toContain("/api/public/states/sp/regions");
  });

  it("limit válido vai como query param (cap 12)", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildPayload()));

    await fetchStateRegions("SP", { limit: 6 });
    const [url] = mockedFetch.mock.calls[0];
    expect(String(url)).toContain("limit=6");

    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildPayload()));
    await fetchStateRegions("SP", { limit: 100 });
    const [urlCapped] = mockedFetch.mock.calls[1];
    expect(String(urlCapped)).toContain("limit=12");
  });
});

describe("fetchStateRegions — happy path", () => {
  it("parsea payload válido", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildPayload()));

    const result = await fetchStateRegions("SP");

    expect(result).not.toBeNull();
    expect(result?.state).toEqual({ code: "SP", slug: "sp" });
    expect(result?.regions).toHaveLength(1);
    expect(result?.regions[0]).toMatchObject({
      slug: "atibaia-sp",
      name: "Região de Atibaia",
      baseCitySlug: "atibaia-sp",
      baseCityName: "Atibaia",
      href: "/carros-usados/regiao/atibaia-sp",
      adsCount: 12,
      featuredCount: 2,
    });
  });

  it("aceita regions vazias (UF sem cobertura)", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, { success: true, data: { state: { code: "SP", slug: "sp" }, regions: [] } })
    );

    const result = await fetchStateRegions("SP");
    expect(result?.regions).toEqual([]);
  });
});

describe("fetchStateRegions — degrade gracioso", () => {
  it("backend 400 (UF inválida) → null silencioso", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(400, { success: false }));
    const result = await fetchStateRegions("SP");
    expect(result).toBeNull();
  });

  it("backend 404 → null silencioso", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(404, {}));
    const result = await fetchStateRegions("SP");
    expect(result).toBeNull();
  });

  it("backend 500 → null", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(500, {}));
    const result = await fetchStateRegions("SP");
    expect(result).toBeNull();
  });

  it("falha de rede → null", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await fetchStateRegions("SP");
    expect(result).toBeNull();
  });

  it("envelope sem success=true → null", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, { success: false, data: { regions: [] } })
    );
    const result = await fetchStateRegions("SP");
    expect(result).toBeNull();
  });

  it("envelope sem state.code/slug → null", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, { success: true, data: { regions: [] } })
    );
    const result = await fetchStateRegions("SP");
    expect(result).toBeNull();
  });

  it("region com shape inválido é filtrado, válidos permanecem", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, {
        success: true,
        data: {
          state: { code: "SP", slug: "sp" },
          regions: [
            { slug: "valida-sp", name: "Região Válida", baseCitySlug: "valida-sp", baseCityName: "Válida", href: "/x", cityNames: ["A"], citySlugs: ["a"], adsCount: 1, featuredCount: 0, radiusKm: 80 },
            null,
            { slug: "incompleta-sp", name: "Incompleta" },
            { slug: "outra-sp", name: "Outra", baseCitySlug: "outra-sp", baseCityName: "Outra", href: "/y", cityNames: ["B"], citySlugs: ["b"], adsCount: 2, featuredCount: 1, radiusKm: 80 },
          ],
        },
      })
    );
    const result = await fetchStateRegions("SP");
    expect(result?.regions.map((r) => r.slug)).toEqual(["valida-sp", "outra-sp"]);
  });
});
