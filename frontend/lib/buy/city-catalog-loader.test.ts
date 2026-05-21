// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchAdsSearchMock = vi.fn();
const fetchAdsFacetsMock = vi.fn();
const fetchFallbackMock = vi.fn();
const resolveCityMetaMock = vi.fn();

vi.mock("@/lib/search/ads-search", async () => {
  const actual = await vi.importActual<typeof import("@/lib/search/ads-search")>(
    "@/lib/search/ads-search"
  );
  return {
    ...actual,
    fetchAdsSearch: (...args: unknown[]) => fetchAdsSearchMock(...args),
    fetchAdsFacets: (...args: unknown[]) => fetchAdsFacetsMock(...args),
  };
});

vi.mock("@/lib/search/catalog-ads-territory-fallback", () => ({
  fetchCatalogAdsTerritoryFallback: (...args: unknown[]) => fetchFallbackMock(...args),
}));

vi.mock("@/lib/city/resolve-city-meta", () => ({
  resolveCityMeta: (...args: unknown[]) => resolveCityMetaMock(...args),
}));

import { loadCityCatalogData } from "./city-catalog-loader";

const emptyResults = {
  success: true,
  ok: true,
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  error: null,
};

const emptyFacets = {
  success: true,
  facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
};

const fallbackResults = {
  success: true,
  ok: true,
  data: [
    { id: 1, slug: "carro-a", title: "Carro A", price: 50000 },
    { id: 2, slug: "carro-b", title: "Carro B", price: 60000 },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  error: null,
};

beforeEach(() => {
  resolveCityMetaMock.mockResolvedValue({
    id: 1,
    slug: "atibaia-sp",
    name: "Atibaia",
    state: "SP",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadCityCatalogData — fallback territorial", () => {
  it("aplica fallback territorial por default quando cidade está vazia (preserva comportamento de /comprar/cidade/)", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce(emptyResults);
    fetchAdsFacetsMock.mockResolvedValueOnce(emptyFacets);
    fetchFallbackMock.mockResolvedValueOnce({
      mode: "fallback",
      slug: "braganca-paulista-sp",
      name: "Bragança Paulista",
      state: "SP",
    });
    fetchAdsSearchMock.mockResolvedValueOnce(fallbackResults);
    fetchAdsFacetsMock.mockResolvedValueOnce(emptyFacets);

    const result = await loadCityCatalogData("atibaia-sp");

    expect(fetchFallbackMock).toHaveBeenCalledTimes(1);
    expect(result.initialResults.pagination.total).toBe(2);
    expect(result.fallbackTerritory).toEqual({
      requestedName: "Atibaia",
      actualName: "Bragança Paulista",
      actualState: "SP",
      actualSlug: "braganca-paulista-sp",
    });
  });

  it("NÃO aplica fallback territorial quando applyTerritoryFallback=false (canônica /carros-em/)", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce(emptyResults);
    fetchAdsFacetsMock.mockResolvedValueOnce(emptyFacets);

    const result = await loadCityCatalogData(
      "atibaia-sp",
      {},
      { applyTerritoryFallback: false }
    );

    // Garantia central do briefing: a listagem nunca pode misturar
    // anúncios de cidades vizinhas. Confirma que (a) o fallback nem é
    // consultado, e (b) os resultados continuam vazios para a cidade
    // pedida.
    expect(fetchFallbackMock).not.toHaveBeenCalled();
    expect(result.initialResults.pagination.total).toBe(0);
    expect(result.initialResults.data).toEqual([]);
    expect(result.fallbackTerritory).toBeUndefined();
  });

  it("não aplica fallback quando há filtros restritivos, mesmo com fallback habilitado", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce(emptyResults);
    fetchAdsFacetsMock.mockResolvedValueOnce(emptyFacets);

    const result = await loadCityCatalogData("atibaia-sp", { brand: "Toyota" });

    expect(fetchFallbackMock).not.toHaveBeenCalled();
    expect(result.fallbackTerritory).toBeUndefined();
  });
});
