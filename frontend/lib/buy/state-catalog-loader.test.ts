// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchAdsSearchMock = vi.fn();
const fetchAdsFacetsMock = vi.fn();

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

import { loadStateCatalogData } from "./state-catalog-loader";

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

beforeEach(() => {
  fetchAdsSearchMock.mockResolvedValue(emptyResults);
  fetchAdsFacetsMock.mockResolvedValue(emptyFacets);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadStateCatalogData — gate de UF", () => {
  it("retorna null para UF inválida (caller chama notFound)", async () => {
    const result = await loadStateCatalogData("zz");
    expect(result).toBeNull();
    expect(fetchAdsSearchMock).not.toHaveBeenCalled();
  });

  it("retorna null para string vazia", async () => {
    expect(await loadStateCatalogData("")).toBeNull();
  });

  it("aceita UF lowercase ('sp') e normaliza para uppercase", async () => {
    const result = await loadStateCatalogData("sp");
    expect(result?.uf).toBe("SP");
    expect(result?.stateName).toBe("São Paulo");
  });

  it("aceita UF uppercase ('MG') sem mudar resposta", async () => {
    const result = await loadStateCatalogData("MG");
    expect(result?.uf).toBe("MG");
    expect(result?.stateName).toBe("Minas Gerais");
  });
});

describe("loadStateCatalogData — filtros canônicos", () => {
  it("filters inclui state da rota e remove resquícios de cidade", async () => {
    const result = await loadStateCatalogData("sp", {
      city_slug: "atibaia-sp",
      city: "Atibaia",
      brand: "Toyota",
    });
    expect(result?.filters.state).toBe("SP");
    expect(result?.filters.brand).toBe("Toyota");
    expect(result?.filters.city_slug).toBeUndefined();
    expect(result?.filters.city).toBeUndefined();
  });

  it("sort default = 'relevance' (PR 2.5: ranking comercial primeiro)", async () => {
    const result = await loadStateCatalogData("sp");
    expect(result?.filters.sort).toBe("relevance");
  });

  it("respeita sort explícito do usuário", async () => {
    const result = await loadStateCatalogData("sp", { sort: "price_asc" });
    expect(result?.filters.sort).toBe("price_asc");
  });
});

describe("loadStateCatalogData — defesa contra placeholder R$ 0", () => {
  it("filtra anúncios com preço zero/inválido antes de retornar", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce({
      ...emptyResults,
      data: [
        { id: 1, slug: "real", title: "Carro real", price: 50000 },
        { id: 2, slug: "placeholder", title: "Placeholder", price: 0 },
        { id: 3, slug: "outro", title: "Outro", price: 60000 },
      ],
      pagination: { ...emptyResults.pagination, total: 3 },
    });

    const result = await loadStateCatalogData("sp");
    const ids = result?.initialResults.data.map((a) => a.id);
    expect(ids).toEqual([1, 3]);
  });
});

describe("loadStateCatalogData — contexto de cidade gerado", () => {
  it("city.name = stateName, city.state = uf, slug pseudo 'estado-[uf]'", async () => {
    const result = await loadStateCatalogData("rj");
    expect(result?.city).toMatchObject({
      name: "Rio de Janeiro",
      state: "RJ",
      slug: "estado-rj",
      label: "Rio de Janeiro (RJ)",
    });
  });
});
