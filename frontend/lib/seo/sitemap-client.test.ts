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
  __resetSitemapLastGoodCache,
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
  // O cache de último-bom é estado de módulo: sem limpar, um caso de sucesso
  // faz o caso de falha seguinte devolver as entries do anterior.
  __resetSitemapLastGoodCache();
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

    const { entries, ok } = await fetchPublicSitemapByType("city_home", 20);
    expect(ok).toBe(true);
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
    const { entries } = await fetchPublicSitemapByType("city_home", 20);
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
    const { entries, ok } = await fetchPublicSitemapByTypes(["city_home", "city_below_fipe"], 20);
    expect(ok).toBe(true);
    expect(entries.map((e) => e.loc).sort()).toEqual([
      "/carros-baratos-em/atibaia-sp",
      "/carros-em/atibaia-sp",
    ]);
  });

  it("vazio LEGÍTIMO do backend é ok:true (não confundir com falha)", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    expect(await fetchPublicSitemapByType("city_home", 20)).toMatchObject({ entries: [], ok: true, source: "fresh" });
  });
});

/**
 * Estes casos ANTES devolviam `[]` puro, indistinguível de "backend disse que
 * não há URLs". Era exatamente essa ambiguidade que fazia o urlset vazio ser
 * servido com TTL de sucesso (incidente 2026-07-27). Agora todo caminho de
 * falha carrega `ok:false` — e é isso que estes testes travam.
 */
describe("sitemap-client — falha é observável (nunca lança, mas nunca finge sucesso)", () => {
  it("URL não resolvida → ok:false", async () => {
    mockedResolve.mockReturnValue("");
    expect(await fetchPublicSitemapByType("city_home", 20)).toMatchObject({ entries: [], ok: false, source: "unavailable" });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("resposta não-ok (429 do rate limit) → ok:false", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    expect(await fetchPublicSitemapByType("city_home", 20)).toMatchObject({ entries: [], ok: false, source: "unavailable" });
  });

  it("payload success=false → ok:false", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: false, data: [] }));
    expect(await fetchPublicSitemapByType("city_home", 20)).toMatchObject({ entries: [], ok: false, source: "unavailable" });
  });

  it("data não-array → ok:false", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: null }));
    expect(await fetchPublicSitemapByType("city_home", 20)).toMatchObject({ entries: [], ok: false, source: "unavailable" });
  });

  it("ssrResilientFetch lança (rede/timeout) → ok:false sem propagar", async () => {
    mockedFetch.mockRejectedValue(new Error("fetch failed"));
    expect(await fetchPublicSitemapByType("city_home", 20)).toMatchObject({ entries: [], ok: false, source: "unavailable" });
  });

  it("JSON inválido → ok:false sem propagar", async () => {
    mockedFetch.mockResolvedValue(
      new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    expect(await fetchPublicSitemapByType("city_home", 20)).toMatchObject({ entries: [], ok: false, source: "unavailable" });
  });

  it("TODO caminho de falha loga (nenhum degrade silencioso)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    await fetchPublicSitemapByType("city_home", 20);

    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toContain("429");
  });

  /**
   * ATUALIZADO NA FASE 2B.1. Antes, um tipo falhando devolvia o conjunto
   * PARCIAL com `ok:false` — a melhor opção possível num mundo em que a
   * resposta era sempre 200. Agora que existe 503, publicar metade das URLs
   * deixou de ser o menos pior: a metade ausente seria lida pelo Google como
   * removida. `unavailable` propaga e a rota devolve 503.
   */
  it("um tipo falhando torna o CONJUNTO indisponível (parcial = remoção silenciosa)", async () => {
    mockedFetch
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: [{ loc: "/carros-em/atibaia-sp" }] })
      )
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate_limited" }));

    const result = await fetchPublicSitemapByTypes(["city_home", "city_below_fipe"], 20);
    expect(result.ok).toBe(false);
    expect(result.source).toBe("unavailable");
    expect(result.entries).toHaveLength(0);
  });

  it("todos os tipos frescos → conjunto fresco", async () => {
    // Uma Response por chamada: o corpo só pode ser lido uma vez, então
    // reutilizar o mesmo objeto faz a segunda leitura falhar.
    mockedFetch.mockImplementation(async () =>
      jsonResponse(200, { success: true, data: [{ loc: "/carros-em/atibaia-sp" }] })
    );
    const result = await fetchPublicSitemapByTypes(["city_home", "city_below_fipe"], 20);
    expect(result.source).toBe("fresh");
    expect(result.ok).toBe(true);
  });
});

describe("sitemap-client — último resultado bom", () => {
  it("degradado reaproveita o último sitemap bom do mesmo path, ainda com ok:false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    // 1ª chamada: sucesso — memoriza.
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: [{ loc: "/carros-em/atibaia-sp" }] })
    );
    const good = await fetchPublicSitemapByType("city_brand", 20);
    expect(good).toMatchObject({ ok: true });
    expect(good.entries).toHaveLength(1);

    // 2ª chamada: 429 — serve o último bom, mas segue marcado como degradado
    // (para o TTL continuar curto e a próxima tentativa vir cedo).
    mockedFetch.mockResolvedValueOnce(jsonResponse(429, { error: "rate_limited" }));
    const degraded = await fetchPublicSitemapByType("city_brand", 20);
    expect(degraded.ok).toBe(false);
    expect(degraded.entries.map((e) => e.loc)).toEqual(["/carros-em/atibaia-sp"]);
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
