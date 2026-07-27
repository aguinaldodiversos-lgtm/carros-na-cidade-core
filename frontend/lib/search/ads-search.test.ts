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

describe("fetchAdsFacets — facets de controle (sellerKinds/transmissions/offers)", () => {
  function mockFacets(facets: Record<string, unknown>) {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, facets }),
    } as unknown as Response);
  }

  it("completa as DUAS categorias de vendedor quando o backend omite uma", async () => {
    // GROUP BY não devolve linha para categoria sem anúncio. É justamente o
    // zero que serve de aviso na sidebar ("Particulares (0)").
    mockFacets({ sellerKinds: [{ seller_kind: "dealer", total: 18 }] });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });

    expect(res.facets.sellerKinds).toEqual([
      { seller_kind: "dealer", total: 18 },
      { seller_kind: "private", total: 0 },
    ]);
  });

  it("ordem de vendedor é fixa dealer→private (render não oscila entre requests)", async () => {
    mockFacets({
      sellerKinds: [
        { seller_kind: "private", total: 3 },
        { seller_kind: "dealer", total: 1 },
      ],
    });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    expect((res.facets.sellerKinds ?? []).map((r) => r.seller_kind)).toEqual(["dealer", "private"]);
  });

  /**
   * A distinção mais importante deste bloco: "(0)" na sidebar tem que
   * significar "contei e não há", nunca "não recebi contagem". Se `offers`
   * ausente virasse {0,0,0}, um timeout do backend afastaria o visitante de
   * "Oportunidades" mesmo com estoque — mentira contada com confiança.
   */
  it("offers AUSENTE vira undefined, não zeros", async () => {
    mockFacets({ brands: [] });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    expect(res.facets.offers).toBeUndefined();
  });

  it("offers vazio {} também vira undefined (nenhuma chave conhecida)", async () => {
    mockFacets({ offers: {} });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    expect(res.facets.offers).toBeUndefined();
  });

  it("offers com zeros REAIS do backend é preservado (contei e não há)", async () => {
    mockFacets({ offers: { opportunity: 0, below_fipe: 0, highlight: 0 } });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    expect(res.facets.offers).toEqual({ opportunity: 0, below_fipe: 0, highlight: 0 });
  });

  it("fetch com falha não fabrica contagem (offers ausente no EMPTY_FACETS)", async () => {
    mockedFetch.mockResolvedValueOnce({ ok: false, status: 502 } as unknown as Response);

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    expect(res.success).toBe(false);
    expect(res.facets.offers).toBeUndefined();
    expect(res.facets.transmissions).toEqual([]);
  });

  it("offers aceita belowFipe camelCase e normaliza negativo para 0", async () => {
    mockFacets({ offers: { opportunity: 2, belowFipe: 4, highlight: -1 } });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    expect(res.facets.offers).toEqual({ opportunity: 2, below_fipe: 4, highlight: 0 });
  });

  it("transmissions preserva o valor cru do banco (a UI casa por substring)", async () => {
    mockFacets({
      transmissions: [
        { transmission: "automatico", total: 18 },
        { transmission: "", total: 5 },
      ],
    });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    // Linha com valor vazio é descartada por normalizeTransmissionFacets —
    // normalizeFacetArray só OMITE a chave e devolveria `{ total: 5 }`, que
    // viraria a chave "undefined" no Record do consumidor.
    expect(res.facets.transmissions).toEqual([{ transmission: "automatico", total: 18 }]);
  });

  it("backend antigo (sem os campos novos) degrada sem quebrar", async () => {
    mockFacets({ brands: [{ brand: "Fiat", total: 4 }], models: [] });

    const res = await fetchAdsFacets({ city_slug: "atibaia-sp" });
    expect(res.facets.brands).toEqual([{ brand: "Fiat", total: 4 }]);
    expect(res.facets.transmissions).toEqual([]);
    // sellerKinds vem completo com zeros — a sidebar só mostra "(0)" quando
    // o array tem linhas, e o BuyMarketplacePageClient trata isso.
    expect(res.facets.sellerKinds ?? []).toHaveLength(2);
  });
});
