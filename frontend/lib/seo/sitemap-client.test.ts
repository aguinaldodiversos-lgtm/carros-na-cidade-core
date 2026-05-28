import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/backend-api", () => ({
  resolveInternalBackendApiUrl: vi.fn(),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import {
  fetchPublicSitemap,
  fetchPublicSitemapByType,
  fetchPublicSitemapByTypes,
  fetchPublicSitemapByRegion,
  detectAvailableStates,
} from "./sitemap-client";

const mockedResolve = vi.mocked(resolveInternalBackendApiUrl);
const mockedFetch = vi.mocked(ssrResilientFetch);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Por padrão, resolve a URL "tal qual" prefixando o backend de produção.
  mockedResolve.mockImplementation(
    (path: string) => `https://carros-na-cidade-core.onrender.com${path}`
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sitemap-client — resolução de URL via helper compartilhado", () => {
  it("city_home chama o endpoint correto do backend", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    await fetchPublicSitemapByType("city_home", 20);

    expect(mockedResolve).toHaveBeenCalledWith("/api/public/seo/sitemap/type/city_home?limit=20");
    const calledUrl = mockedFetch.mock.calls[0][0];
    expect(calledUrl).toBe(
      "https://carros-na-cidade-core.onrender.com/api/public/seo/sitemap/type/city_home?limit=20"
    );
  });

  it("region usa o endpoint /region/:state", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    await fetchPublicSitemapByRegion("SP", 100);
    expect(mockedResolve).toHaveBeenCalledWith("/api/public/seo/sitemap/region/SP?limit=100");
  });

  it("sitemap.json usa o endpoint canônico", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    await fetchPublicSitemap(50);
    expect(mockedResolve).toHaveBeenCalledWith("/api/public/seo/sitemap.json?limit=50");
  });

  it("usa ssrResilientFetch com revalidate de 1h e logTag", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    await fetchPublicSitemapByType("city_below_fipe", 20);
    const opts = mockedFetch.mock.calls[0][1];
    expect(opts).toMatchObject({
      method: "GET",
      logTag: "sitemap-client",
      next: { revalidate: 3600 },
    });
  });
});

describe("sitemap-client — parse e normalização", () => {
  it("retorna entries normalizadas do payload de sucesso", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          { loc: "/carros-em/atibaia-sp", priority: "0.8", clusterType: "city_home" },
          { loc: "/carros-em/braganca-paulista-sp", priority: 0.8, clusterType: "city_home" },
        ],
      })
    );

    const entries = await fetchPublicSitemapByType("city_home", 20);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      loc: "/carros-em/atibaia-sp",
      priority: 0.8,
      clusterType: "city_home",
    });
  });

  it("dedupe por loc mantendo maior priority", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          { loc: "/carros-em/atibaia-sp", priority: 0.5 },
          { loc: "/carros-em/atibaia-sp", priority: 0.9 },
        ],
      })
    );
    const entries = await fetchPublicSitemapByType("city_home", 20);
    expect(entries).toHaveLength(1);
    expect(entries[0].priority).toBe(0.9);
  });

  it("fetchPublicSitemapByTypes junta múltiplos tipos e dedupe", async () => {
    mockedFetch
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: [{ loc: "/carros-em/atibaia-sp" }] })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: [{ loc: "/carros-baratos-em/atibaia-sp" }] })
      );
    const entries = await fetchPublicSitemapByTypes(["city_home", "city_below_fipe"], 20);
    expect(entries.map((e) => e.loc).sort()).toEqual([
      "/carros-baratos-em/atibaia-sp",
      "/carros-em/atibaia-sp",
    ]);
  });
});

describe("sitemap-client — degrade gracioso (nunca lança)", () => {
  it("URL não resolvida → []", async () => {
    mockedResolve.mockReturnValue("");
    const entries = await fetchPublicSitemapByType("city_home", 20);
    expect(entries).toEqual([]);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("resposta não-ok (429/503) → []", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    const entries = await fetchPublicSitemapByType("city_home", 20);
    expect(entries).toEqual([]);
  });

  it("payload success=false → []", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: false, data: [] }));
    expect(await fetchPublicSitemapByType("city_home", 20)).toEqual([]);
  });

  it("data não-array → []", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: null }));
    expect(await fetchPublicSitemapByType("city_home", 20)).toEqual([]);
  });

  it("ssrResilientFetch lança (rede/timeout) → [] sem propagar", async () => {
    mockedFetch.mockRejectedValue(new Error("fetch failed"));
    const entries = await fetchPublicSitemapByType("city_home", 20);
    expect(entries).toEqual([]);
  });

  it("JSON inválido → [] sem propagar", async () => {
    mockedFetch.mockResolvedValue(
      new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    expect(await fetchPublicSitemapByType("city_home", 20)).toEqual([]);
  });
});

describe("sitemap-client — detectAvailableStates", () => {
  it("extrai estados únicos ordenados", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          { loc: "/carros-em/atibaia-sp", state: "SP" },
          { loc: "/carros-em/rio-de-janeiro-rj", state: "RJ" },
          { loc: "/carros-em/santos-sp", state: "sp" },
        ],
      })
    );
    const states = await detectAvailableStates(100);
    expect(states).toEqual(["RJ", "SP"]);
  });
});
