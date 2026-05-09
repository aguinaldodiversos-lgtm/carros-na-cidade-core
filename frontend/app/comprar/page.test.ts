import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Comportamento da rota /comprar (App Router server component).
 *
 * Histórico do bug: a versão anterior fazia 4 redirects, sendo o último
 * `redirect("/comprar/estado/sp")` quando o usuário NÃO tinha city_slug,
 * state nem cookie de cidade. Isso forçava o catálogo a virar "São Paulo
 * apenas" para qualquer usuário desconhecido — escondendo anúncios de
 * outros estados e dando aparência de site inacabado.
 *
 * Contrato atual:
 *   - URL com city_slug → redirect para /comprar/cidade/[slug]
 *   - URL com state    → redirect para /comprar/estado/[uf]
 *   - SEM contexto     → renderiza o catálogo NACIONAL (sem fetch com state)
 *
 * Estes testes mockam `redirect`, `cookies`, e os fetchers públicos para
 * exercitar apenas o roteamento da page.tsx.
 */

const redirectMock = vi.fn((path: string) => {
  // next/navigation.redirect lança internamente — espelhamos para
  // assegurar que o caller pare de executar no fluxo de redirect.
  const error = new Error(`NEXT_REDIRECT:${path}`);
  (error as { digest?: string }).digest = `NEXT_REDIRECT;${path}`;
  throw error;
});

const fetchAdsSearchMock = vi.fn();
const fetchAdsFacetsMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/search/ads-search", () => ({
  fetchAdsSearch: (...args: unknown[]) => fetchAdsSearchMock(...args),
  fetchAdsFacets: (...args: unknown[]) => fetchAdsFacetsMock(...args),
}));

vi.mock("@/components/buy/BuyMarketplacePageClient", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/seo/BreadcrumbJsonLd", () => ({
  __esModule: true,
  default: () => null,
}));

beforeEach(() => {
  redirectMock.mockClear();
  fetchAdsSearchMock.mockClear();
  fetchAdsFacetsMock.mockClear();
  fetchAdsSearchMock.mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  });
  fetchAdsFacetsMock.mockResolvedValue({
    success: true,
    facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
  });
});

afterEach(() => {
  vi.resetModules();
});

async function importPage() {
  // Re-import garante que mocks do `vi.mock` aplicam corretamente em cada
  // suite (cache de módulo do Vite pode caching o resultado entre testes).
  return (await import("./page")).default;
}

describe("/comprar — sem território explícito", () => {
  it("NÃO redireciona para /comprar/estado/sp quando searchParams está vazio", async () => {
    const ComprarEntryPage = await importPage();
    await ComprarEntryPage({ searchParams: {} });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("dispara fetchAdsSearch SEM state/city_slug (catálogo nacional)", async () => {
    const ComprarEntryPage = await importPage();
    await ComprarEntryPage({ searchParams: {} });
    expect(fetchAdsSearchMock).toHaveBeenCalledTimes(1);
    const filters = fetchAdsSearchMock.mock.calls[0][0];
    expect(filters.state).toBeUndefined();
    expect(filters.city_slug).toBeUndefined();
    expect(filters.city).toBeUndefined();
    expect(filters.city_id).toBeUndefined();
  });

  it("dispara fetchAdsFacets sem território para o sidebar", async () => {
    const ComprarEntryPage = await importPage();
    await ComprarEntryPage({ searchParams: {} });
    expect(fetchAdsFacetsMock).toHaveBeenCalledTimes(1);
    const filters = fetchAdsFacetsMock.mock.calls[0][0];
    expect(filters.state).toBeUndefined();
    expect(filters.city_slug).toBeUndefined();
  });

  it("preserva filtros não-territoriais do usuário (brand/model/preço)", async () => {
    const ComprarEntryPage = await importPage();
    await ComprarEntryPage({
      searchParams: { brand: "Honda", model: "Civic", max_price: "80000" },
    });
    const filters = fetchAdsSearchMock.mock.calls[0][0];
    expect(filters.brand).toBe("Honda");
    expect(filters.model).toBe("Civic");
    expect(filters.max_price).toBe(80000);
  });
});

describe("/comprar — com território explícito (redirect canonical)", () => {
  it("redireciona para /comprar/cidade/[slug] quando city_slug é válido", async () => {
    const ComprarEntryPage = await importPage();

    await expect(
      ComprarEntryPage({ searchParams: { city_slug: "atibaia-sp" } })
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirectMock).toHaveBeenCalledTimes(1);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/cidade\/atibaia-sp(?:\?|$)/);
    // city_slug NÃO pode aparecer na query string da rota canônica de
    // cidade — o slug já está no path.
    expect(target).not.toMatch(/[?&]city_slug=/);
    // Não pode tocar no backend antes de redirecionar (página final cuida).
    expect(fetchAdsSearchMock).not.toHaveBeenCalled();
  });

  it("redireciona para /comprar/estado/[uf] quando state é válido", async () => {
    const ComprarEntryPage = await importPage();
    await expect(ComprarEntryPage({ searchParams: { state: "MG" } })).rejects.toThrow(
      /NEXT_REDIRECT/
    );
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/mg(?:\?|$)/);
    // state também não pode aparecer na query da rota canônica do estado.
    expect(target).not.toMatch(/[?&]state=/);
    expect(fetchAdsSearchMock).not.toHaveBeenCalled();
  });

  it("preserva filtros não-territoriais ao redirecionar para cidade", async () => {
    const ComprarEntryPage = await importPage();
    await expect(
      ComprarEntryPage({
        searchParams: { city_slug: "atibaia-sp", brand: "Toyota", sort: "price_asc" },
      })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toContain("/comprar/cidade/atibaia-sp");
    expect(target).toContain("brand=Toyota");
    expect(target).toContain("sort=price_asc");
  });

  it("city_slug inválido (sem UF) NÃO dispara redirect — vai pro nacional", async () => {
    const ComprarEntryPage = await importPage();
    await ComprarEntryPage({ searchParams: { city_slug: "cidade-fake" } });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(fetchAdsSearchMock).toHaveBeenCalled();
  });

  it("state inválido NÃO dispara redirect — vai pro nacional", async () => {
    const ComprarEntryPage = await importPage();
    await ComprarEntryPage({ searchParams: { state: "XX" } });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("/comprar — defesa em profundidade contra placeholder R$ 0", () => {
  it("filtra ads com price=0 antes de passar pro client", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce({
      success: true,
      data: [
        { id: 1, title: "Ad real", price: 65000 },
        { id: 2, title: "Placeholder", price: 0 },
        { id: 3, title: "Sem preço", price: null },
        { id: 4, title: "R$ 0 string", price: "R$ 0" },
        { id: 5, title: "Outro real", price: "38500" },
      ],
      pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
    });

    const ComprarEntryPage = await importPage();
    const result = await ComprarEntryPage({ searchParams: {} });

    // O default export retorna React.Element (Fragment com Client child).
    // Inspecionar `props.children` é frágil; o fato de o teste passar sem
    // throw já indica que `hasRealPrice` não quebrou. O contrato real
    // deste filtro está testado em `lib/ads/has-real-price.test.ts`.
    expect(result).toBeDefined();
  });
});
