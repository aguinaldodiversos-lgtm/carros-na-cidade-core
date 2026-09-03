import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCityTerritorialPage: vi.fn(),
  fetchCityBelowFipeTerritorialPage: vi.fn(),
  fetchAdsSearch: vi.fn(),
  fetchAdsFacets: vi.fn(),
  notFound: vi.fn(() => {
    const err = new Error("NEXT_NOT_FOUND") as Error & { digest: string };
    err.digest = "NEXT_NOT_FOUND";
    throw err;
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/search/territorial-public", () => ({
  fetchCityTerritorialPage: mocks.fetchCityTerritorialPage,
  fetchCityBelowFipeTerritorialPage: mocks.fetchCityBelowFipeTerritorialPage,
}));
vi.mock("@/lib/search/ads-search", () => ({
  fetchAdsSearch: mocks.fetchAdsSearch,
  fetchAdsFacets: mocks.fetchAdsFacets,
}));

const { loadLocalSeoLanding } = await import("@/lib/seo/local-seo-data");

/**
 * Serviço de conteúdo fora NÃO pode virar 404 numa cidade com estoque.
 *
 * ── O defeito que estes testes travam (auditoria Fase 5.0, §25) ─────────────
 * `loadLocalSeoLanding` terminava em `catch { notFound(); }`. Esse loader
 * alimenta apenas metadata e JSON-LD — mas a falha dele derrubava a PÁGINA
 * INTEIRA de `/carros-em/[slug]`, inclusive o catálogo transacional, que vem de
 * outro loader e estava disponível. Um blip de rede virava 404 numa cidade com
 * 27 anúncios no ar.
 *
 * A separação que a Fase 5.0B introduziu:
 *
 *   cidade não existe        → 404, sempre, nos dois modos
 *   serviço caiu + "degrade" → modelo mínimo, página 200 (noindex)
 *   serviço caiu + padrão    → 404 (comportamento histórico das landings irmãs)
 */

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchAdsSearch.mockResolvedValue({ data: [], pagination: { total: 0 } });
  mocks.fetchAdsFacets.mockResolvedValue({ facets: { brands: [] } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadLocalSeoLanding — falha do serviço de conteúdo", () => {
  it("modo padrão: exceção de rede vira 404 (comportamento histórico)", async () => {
    mocks.fetchCityTerritorialPage.mockRejectedValue(new Error("ECONNRESET"));

    await expect(loadLocalSeoLanding("atibaia-sp", "em")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('modo "degrade": exceção de rede NÃO vira 404 — devolve modelo mínimo', async () => {
    mocks.fetchCityTerritorialPage.mockRejectedValue(new Error("ECONNRESET"));

    const model = await loadLocalSeoLanding("atibaia-sp", "em", {
      onServiceFailure: "degrade",
    });

    expect(model.slug).toBe("atibaia-sp");
    expect(model.cityName).toBe("Atibaia");
    expect(model.state).toBe("SP");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('modo "degrade" produz noindex — não afirma indexabilidade sem confirmar estoque', async () => {
    mocks.fetchCityTerritorialPage.mockRejectedValue(new Error("timeout"));

    const model = await loadLocalSeoLanding("atibaia-sp", "em", {
      onServiceFailure: "degrade",
    });

    // `shouldIndexLocalSeo` compara `totalAds` com o limiar (3). Zero = noindex.
    expect(model.totalAds).toBe(0);
    expect(model.isEmptyCity).toBe(true);
  });

  it('CIDADE INEXISTENTE continua 404 mesmo em "degrade"', async () => {
    // Resposta bem-sucedida, mas sem cidade: é o 404 legítimo.
    mocks.fetchCityTerritorialPage.mockResolvedValue({ city: null });

    await expect(
      loadLocalSeoLanding("cidade-fantasma-zz", "em", { onServiceFailure: "degrade" })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("slug vazio continua 404 nos dois modos", async () => {
    await expect(loadLocalSeoLanding("", "em", { onServiceFailure: "degrade" })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("caminho feliz não é afetado pela opção", async () => {
    mocks.fetchCityTerritorialPage.mockResolvedValue({
      city: { name: "Atibaia", state: "SP", region: null },
      stats: { totalAds: 27, minPrice: 57900, maxPrice: 103900, totalBelowFipeAds: 8 },
      pagination: { recentAds: { total: 27 } },
      sections: { recentAds: [{ price: 70000 }] },
      facets: { brands: [{ brand: "Fiat", total: 7 }] },
    });

    const model = await loadLocalSeoLanding("atibaia-sp", "em", {
      onServiceFailure: "degrade",
    });

    expect(model.totalAds).toBe(27);
    expect(model.cityName).toBe("Atibaia");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
