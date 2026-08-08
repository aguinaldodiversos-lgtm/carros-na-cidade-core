// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/backend-api", () => ({
  resolveInternalBackendApiUrl: vi.fn((path: string) => `https://backend.test${path}`),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

const mockedFetch = vi.mocked(ssrResilientFetch);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function indexLocs(): Promise<string[]> {
  const { GET } = await import("../sitemap.xml/route");
  const body = await (await GET()).text();
  return [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * O índice existe para dizer ao Googlebot onde vale gastar crawl budget.
 * Anunciar um filho que sempre responde `<urlset></urlset>` gasta uma
 * requisição para dizer nada — a cada visita.
 */
describe("sitemap index — só filhos úteis", () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
  });

  it.each([
    "/sitemaps/core.xml",
    "/sitemaps/content.xml",
    "/sitemaps/cities.xml",
    "/sitemaps/brands.xml",
    "/sitemaps/below-fipe.xml",
    "/sitemaps/blog.xml",
    "/sitemaps/vehicles.xml",
  ])("anuncia %s", async (path) => {
    expect((await indexLocs()).some((loc) => loc.endsWith(path))).toBe(true);
  });

  /**
   * Vazios POR DESIGN: as URLs que eles listariam canonicalizam para outras
   * famílias, então nunca terão conteúdo enquanto essa política valer. As rotas
   * continuam existindo — só deixam de ser recomendadas.
   */
  it.each(["/sitemaps/local-seo.xml", "/sitemaps/opportunities.xml"])(
    "NÃO anuncia %s (vazio por design)",
    async (path) => {
      expect((await indexLocs()).some((loc) => loc.endsWith(path))).toBe(false);
    }
  );

  /**
   * `models.xml` fica, e a distinção é o ponto: ele está vazio por FALTA DE
   * ESTOQUE (modelo mais frequente = 2 anúncios, limiar = 3), não por design.
   * É condição temporária que se resolve sozinha — e aí o índice já aponta.
   */
  it("anuncia models.xml — vazio por falta de estoque, não por design", async () => {
    expect((await indexLocs()).some((loc) => loc.endsWith("/sitemaps/models.xml"))).toBe(true);
  });
});

describe("sitemap index — regionais", () => {
  it("anuncia a UF que tem cidade publicável", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          { loc: "/carros-em/atibaia-sp", state: "SP" },
          { loc: "/carros-em/curitiba-pr", state: "PR" },
        ],
      })
    );

    const locs = await indexLocs();
    expect(locs.some((l) => l.endsWith("/sitemaps/regiao/sp.xml"))).toBe(true);
    expect(locs.some((l) => l.endsWith("/sitemaps/regiao/pr.xml"))).toBe(true);
  });

  it("NÃO anuncia UF sem cidade publicável", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: [{ loc: "/carros-em/atibaia-sp", state: "SP" }] })
    );

    const locs = await indexLocs();
    expect(locs.some((l) => l.endsWith("/sitemaps/regiao/ce.xml"))).toBe(false);
    expect(locs.some((l) => l.endsWith("/sitemaps/regiao/rj.xml"))).toBe(false);
  });

  it("sem cidade nenhuma, nenhum regional é anunciado", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    expect((await indexLocs()).some((l) => l.includes("/regiao/"))).toBe(false);
  });

  /**
   * Backend degradado não pode virar "nenhuma UF existe". Remover regionais do
   * índice porque o backend piscou é o mesmo erro do urlset vazio, um nível
   * acima — e o índice em si continua servindo os filhos fixos.
   */
  it("backend fora degrada só os regionais; o índice continua útil", async () => {
    mockedFetch.mockRejectedValue(new Error("fetch failed"));

    const locs = await indexLocs();
    expect(locs.some((l) => l.includes("/regiao/"))).toBe(false);
    expect(locs.some((l) => l.endsWith("/sitemaps/cities.xml"))).toBe(true);
    expect(locs.length).toBeGreaterThanOrEqual(8);
  });

  it("UF vem do campo `state`, não de parsing de slug", async () => {
    // O backend conhece a UF (`c.state AS state` na query). Se o campo sumir,
    // o regional some do índice — falha visível, melhor que adivinhar errado.
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: [{ loc: "/carros-em/atibaia-sp" }] })
    );
    expect((await indexLocs()).some((l) => l.includes("/regiao/"))).toBe(false);
  });

  it("ignora `state` malformado", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          { loc: "/carros-em/x-sp", state: "São Paulo" },
          { loc: "/carros-em/y-sp", state: "SP" },
        ],
      })
    );
    const locs = await indexLocs();
    expect(locs.filter((l) => l.includes("/regiao/"))).toHaveLength(1);
    expect(locs.some((l) => l.endsWith("/sitemaps/regiao/sp.xml"))).toBe(true);
  });
});

describe("sitemap index — lastmod", () => {
  it("não emite lastmod artificial", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    const { GET } = await import("../sitemap.xml/route");
    expect(await (await GET()).text()).not.toContain("<lastmod>");
  });

  it("duas leituras sem mudança produzem XML idêntico", async () => {
    mockedFetch.mockImplementation(async () => jsonResponse(200, { success: true, data: [] }));
    const { GET } = await import("../sitemap.xml/route");
    expect(await (await GET()).text()).toBe(await (await GET()).text());
  });
});
