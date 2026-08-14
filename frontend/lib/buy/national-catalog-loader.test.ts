// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Loader SSR da vitrine nacional (`/comprar`) — hotfix 2026-08-13.
 *
 * O defeito que estes testes travam: `/comprar` respondia 200 sem NENHUM
 * veículo, porque a rota montava um diretório de estados/cidades em vez do
 * catálogo. Aqui provamos as duas metades da correção:
 *
 *   1. os anúncios são buscados no SERVIDOR (o loader chama `fetchAdsSearch`);
 *   2. a busca é NACIONAL — nenhum território sai daqui para o backend.
 *
 * O item 2 é o mais importante a longo prazo: `/comprar` já resolveu estado por
 * cookie com default SP. Se isso voltar por qualquer caminho, a asserção sobre
 * os argumentos do fetch cai.
 */

const fetchAdsSearchMock = vi.fn();
const fetchAdsFacetsMock = vi.fn();

vi.mock("@/lib/search/ads-search", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/search/ads-search")>("@/lib/search/ads-search");
  return {
    ...actual,
    fetchAdsSearch: (...args: unknown[]) => fetchAdsSearchMock(...args),
    fetchAdsFacets: (...args: unknown[]) => fetchAdsFacetsMock(...args),
  };
});

import { loadNationalCatalogData, NATIONAL_CITY_CONTEXT } from "./national-catalog-loader";

const okResults = {
  success: true,
  ok: true,
  data: [],
  pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
  error: null,
};

const okFacets = {
  success: true,
  facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
};

beforeEach(() => {
  fetchAdsSearchMock.mockResolvedValue(okResults);
  fetchAdsFacetsMock.mockResolvedValue(okFacets);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadNationalCatalogData — o catálogo é carregado no servidor", () => {
  it("busca anúncios e facets (não delega para o cliente)", async () => {
    await loadNationalCatalogData({});
    expect(fetchAdsSearchMock).toHaveBeenCalledTimes(1);
    expect(fetchAdsFacetsMock).toHaveBeenCalledTimes(1);
  });

  it("devolve os anúncios reais e o total da resposta — nunca um número fixo", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce({
      ...okResults,
      data: [
        { id: 1, slug: "civic-2020", title: "Honda Civic", price: 90000 },
        { id: 2, slug: "onix-2019", title: "Chevrolet Onix", price: 55000 },
      ],
      pagination: { page: 1, limit: 50, total: 28, totalPages: 1 },
    });

    const result = await loadNationalCatalogData({});
    expect(result.initialResults.data).toHaveLength(2);
    expect(result.initialResults.pagination.total).toBe(28);
  });
});

describe("loadNationalCatalogData — a consulta é NACIONAL", () => {
  it("não envia state/city/city_slug/city_id/city_slugs ao backend", async () => {
    await loadNationalCatalogData({});
    const [filters] = fetchAdsSearchMock.mock.calls[0];

    expect(filters.state).toBeUndefined();
    expect(filters.city).toBeUndefined();
    expect(filters.city_slug).toBeUndefined();
    expect(filters.city_id).toBeUndefined();
    expect(filters.city_slugs).toBeUndefined();
  });

  it("não injeta SP nem a primeira cidade do estoque (anti-fallback)", async () => {
    // O acervo inteiro concentrado numa cidade não pode virar recorte
    // territorial: a rota continua nacional. Este é o cenário de produção
    // (1 cidade, 1 lojista) e o exato caminho de volta do bug.
    fetchAdsSearchMock.mockResolvedValueOnce({
      ...okResults,
      data: [{ id: 1, slug: "civic", title: "Civic", price: 90000, city: "Atibaia", state: "SP" }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const result = await loadNationalCatalogData({});
    const [filters] = fetchAdsSearchMock.mock.calls[0];

    expect(JSON.stringify(filters)).not.toMatch(/atibaia/i);
    expect(filters.state).toBeUndefined();
    expect(result.filters.state).toBeUndefined();
  });

  it("território vindo da query é descartado antes do fetch", async () => {
    await loadNationalCatalogData({ state: "SP", city_slug: "atibaia-sp", brand: "Honda" });
    const [filters] = fetchAdsSearchMock.mock.calls[0];

    expect(filters.state).toBeUndefined();
    expect(filters.city_slug).toBeUndefined();
    expect(filters.brand).toBe("Honda");
  });

  it("o contexto de cidade sintético não carrega UF nem slug", async () => {
    // `FilterSidebar` deriva o select de Estado de `filters.state || city.state`
    // e o link "Apenas <cidade>" de `filters.city_slug || city.slug`. Preencher
    // qualquer um faria a sidebar mostrar um recorte que a página não aplicou.
    const result = await loadNationalCatalogData({});
    expect(result.city).toEqual(NATIONAL_CITY_CONTEXT);
    expect(result.city.state).toBe("");
    expect(result.city.slug).toBe("");
  });
});

describe("loadNationalCatalogData — sanitização pública", () => {
  it("derruba placeholder de preço zero", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce({
      ...okResults,
      data: [
        { id: 1, slug: "real", title: "Carro real", price: 50000 },
        { id: 2, slug: "placeholder", title: "Placeholder", price: 0 },
        { id: 3, slug: "outro", title: "Outro", price: 60000 },
      ],
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    });

    const result = await loadNationalCatalogData({});
    expect(result.initialResults.data.map((ad) => ad.id)).toEqual([1, 3]);
  });
});

describe("loadNationalCatalogData — falha de backend não vira 'Brasil sem estoque'", () => {
  it("busca indisponível marca resultsOk=false (e não afirma catálogo vazio)", async () => {
    // `fetchAdsSearch` NUNCA lança: em erro devolve ok:false + data vazia. Se o
    // caller tratar isso como "não há anúncios", uma queda de backend vira uma
    // página que declara o Brasil vazio — foi assim que uma indisponibilidade
    // ficou escondida por semanas atrás de uma lista vazia cacheada.
    fetchAdsSearchMock.mockResolvedValueOnce({
      success: false,
      ok: false,
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
      error: "Falha ao buscar anúncios (502)",
    });

    const result = await loadNationalCatalogData({});
    expect(result.resultsOk).toBe(false);
  });

  it("catálogo realmente vazio marca resultsOk=true", async () => {
    const result = await loadNationalCatalogData({});
    expect(result.resultsOk).toBe(true);
    expect(result.initialResults.data).toHaveLength(0);
  });

  it("facets quebradas NÃO derrubam os resultados", async () => {
    fetchAdsFacetsMock.mockRejectedValueOnce(new Error("timeout"));
    fetchAdsSearchMock.mockResolvedValueOnce({
      ...okResults,
      data: [{ id: 1, slug: "civic", title: "Civic", price: 90000 }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const result = await loadNationalCatalogData({});
    expect(result.initialResults.data).toHaveLength(1);
    expect(result.facetsOk).toBe(false);
    expect(result.initialFacets.brands).toEqual([]);
  });

  it("busca que rejeita não derruba a página (degrada para vazio marcado)", async () => {
    fetchAdsSearchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await loadNationalCatalogData({});
    expect(result.initialResults.data).toEqual([]);
    expect(result.resultsOk).toBe(false);
  });
});
