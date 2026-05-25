// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchAdsSearchMock = vi.fn();
const fetchAdsFacetsMock = vi.fn();
const fetchRegionByCitySlugMock = vi.fn();

vi.mock("@/lib/search/ads-search", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/search/ads-search")>("@/lib/search/ads-search");
  return {
    ...actual,
    fetchAdsSearch: (...args: unknown[]) => fetchAdsSearchMock(...args),
    fetchAdsFacets: (...args: unknown[]) => fetchAdsFacetsMock(...args),
  };
});

vi.mock("@/lib/regions/fetch-region", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/regions/fetch-region")>(
      "@/lib/regions/fetch-region"
    );
  return {
    ...actual,
    fetchRegionByCitySlug: (...args: unknown[]) => fetchRegionByCitySlugMock(...args),
  };
});

import { loadRegionalCatalogData } from "./region-catalog-loader";

const baseRegion = {
  base: { id: 1001, slug: "atibaia-sp", name: "Atibaia", state: "sp" },
  members: [
    { city_id: 2001, slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "sp", distance_km: 12 },
    { city_id: 2002, slug: "jundiai-sp", name: "Jundiaí", state: "sp", distance_km: 25 },
  ],
  radius_km: 80,
};

const validResults = {
  success: true,
  ok: true,
  data: [{ id: 1, slug: "ad-1", title: "A", price: 100, city: "Atibaia", state: "SP" }],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  error: null,
};

const validFacets = {
  success: true,
  facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadRegionalCatalogData — briefing P2-B 2026-05-25", () => {
  describe("contrato territorial", () => {
    it("regional inválida (region=null) → retorna null para 404 real", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue(null);
      const out = await loadRegionalCatalogData("slug-inexistente-zz", {});
      expect(out).toBeNull();
    });

    it("slug vazio → retorna null sem chamar backend", async () => {
      const out = await loadRegionalCatalogData("   ", {});
      expect(out).toBeNull();
      expect(fetchRegionByCitySlugMock).not.toHaveBeenCalled();
    });

    it("city_slugs[0] sempre é a cidade-base (boost SQL preserva tier por proximidade)", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue(baseRegion);
      fetchAdsSearchMock.mockResolvedValue(validResults);
      fetchAdsFacetsMock.mockResolvedValue(validFacets);

      const out = await loadRegionalCatalogData("atibaia-sp", {});
      expect(out).not.toBeNull();
      expect(out!.filters.city_slugs).toBeDefined();
      expect(out!.filters.city_slugs![0]).toBe("atibaia-sp");
      expect(out!.filters.city_slugs).toContain("braganca-paulista-sp");
      expect(out!.filters.city_slugs).toContain("jundiai-sp");
    });

    it("city + state preservados no contexto de retorno", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue(baseRegion);
      fetchAdsSearchMock.mockResolvedValue(validResults);
      fetchAdsFacetsMock.mockResolvedValue(validFacets);

      const out = await loadRegionalCatalogData("atibaia-sp", {});
      expect(out!.city.name).toBe("Atibaia");
      expect(out!.city.state).toBe("SP");
      expect(out!.city.slug).toBe("atibaia-sp");
      expect(out!.stateUf).toBe("SP");
    });
  });

  describe("PROTEÇÃO override territorial — regra crítica do briefing P2-B", () => {
    it("user tentando setar ?city_slug=outra-cidade NÃO sobrescreve city_slugs da região", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue(baseRegion);
      fetchAdsSearchMock.mockResolvedValue(validResults);
      fetchAdsFacetsMock.mockResolvedValue(validFacets);

      const out = await loadRegionalCatalogData("atibaia-sp", {
        city_slug: "campinas-sp",
      });
      // city_slugs[0] ainda é atibaia-sp (base canônica), não campinas-sp.
      expect(out!.filters.city_slugs![0]).toBe("atibaia-sp");
    });

    it("user tentando setar ?state=mg NÃO sobrescreve state da região", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue(baseRegion);
      fetchAdsSearchMock.mockResolvedValue(validResults);
      fetchAdsFacetsMock.mockResolvedValue(validFacets);

      const out = await loadRegionalCatalogData("atibaia-sp", { state: "mg" });
      // state da região (SP) prevalece — user override descartado.
      expect((out!.filters.state || "").toLowerCase()).toBe("sp");
    });

    it("user tentando setar ?city_slugs=array NÃO sobrescreve", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue(baseRegion);
      fetchAdsSearchMock.mockResolvedValue(validResults);
      fetchAdsFacetsMock.mockResolvedValue(validFacets);

      // pickUserOverrides já não inclui city_slugs em parsedFilters, mas
      // se URL trouxer um valor exótico, ele NÃO deve vazar nos filters.
      const out = await loadRegionalCatalogData("atibaia-sp", {
        city_slugs: "outra-cidade-zz,fake-city-xx",
      });
      // city_slugs final NÃO contém o que o user mandou.
      expect(out!.filters.city_slugs).not.toContain("outra-cidade-zz");
      expect(out!.filters.city_slugs).not.toContain("fake-city-xx");
    });

    it("filtros NÃO-territoriais do user (brand, year_min, etc.) SÃO aplicados", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue(baseRegion);
      fetchAdsSearchMock.mockResolvedValue(validResults);
      fetchAdsFacetsMock.mockResolvedValue(validFacets);

      const out = await loadRegionalCatalogData("atibaia-sp", {
        brand: "Honda",
        year_min: "2020",
      });
      expect(out!.filters.brand).toBe("Honda");
      expect(out!.filters.year_min).toBe(2020);
    });
  });

  describe("fallback warn quando members vazio", () => {
    it("region sem members → continua devolvendo city_slugs com só a base", async () => {
      fetchRegionByCitySlugMock.mockResolvedValue({
        ...baseRegion,
        members: [],
      });
      fetchAdsSearchMock.mockResolvedValue(validResults);
      fetchAdsFacetsMock.mockResolvedValue(validFacets);

      const out = await loadRegionalCatalogData("atibaia-sp", {});
      expect(out!.filters.city_slugs).toEqual(["atibaia-sp"]);
    });
  });
});
