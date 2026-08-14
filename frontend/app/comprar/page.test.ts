// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * `/comprar` — CATÁLOGO NACIONAL.
 *
 * ── Primeira volta: era um redirector ────────────────────────────────────────
 * A versão original desta suíte travava o comportamento oposto: "nunca renderiza
 * in-place", redirect por cookie e, sem cookie, estado default. Era o defeito,
 * não o contrato:
 *
 *   - a MESMA URL devolvia destino diferente por visitante (cookie), e um
 *     redirect não-determinístico não é canonicalizável;
 *   - `redirect()` em Server Component do Next 14.2 pode comitar 200 com meta
 *     refresh — o crawler vê página 200 sem canonical própria e herda a da home;
 *   - sem território, caía num estado fixo.
 *
 * ── Segunda volta: virou um diretório ────────────────────────────────────────
 * A correção acima matou o redirect, mas pôs no lugar um índice territorial:
 * HTTP 200 listando "Estados com anúncios ativos" e "Cidades com anúncios
 * ativos", e NENHUM veículo — com 28 anúncios ativos no banco. No celular,
 * "Comprar" (bottom nav) levava a um menu que exigia dois cliques territoriais
 * antes do primeiro carro. Os testes desta suíte passavam: eles cobriam
 * canonical e ausência de redirect, e nada afirmava que a rota MOSTRA CARROS.
 *
 * ── Contrato atual (hotfix 2026-08-13) ───────────────────────────────────────
 *   1. a rota MONTA o catálogo compartilhado (`BuyMarketplacePageClient`),
 *      com `variant="nacional"` — não um diretório, não um catálogo paralelo;
 *   2. os anúncios vêm do SSR;
 *   3. NENHUM território entra nos filtros: sem SP, sem Atibaia, sem cookie,
 *      sem geolocalização;
 *   4. a metadata sai da política central de query;
 *   5. o diretório territorial sobrevive, mas DEPOIS do catálogo.
 *
 * As grafias parametrizadas legadas (`?city_slug=`, `?state=`) redirecionam com
 * 308 real no middleware — contrato coberto em
 * `lib/middleware/canonical-redirects.test.ts`.
 *
 * Teste de árvore de elementos (não de DOM): o Page é um Server Component
 * async; chamá-lo devolve o JSX, e é nele que as props do catálogo estão.
 */

const fetchAdsSearchMock = vi.fn();
const fetchAdsFacetsMock = vi.fn();
const fetchPublicCitySetMock = vi.fn();

vi.mock("@/lib/search/ads-search", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/search/ads-search")>("@/lib/search/ads-search");
  return {
    ...actual,
    fetchAdsSearch: (...args: unknown[]) => fetchAdsSearchMock(...args),
    fetchAdsFacets: (...args: unknown[]) => fetchAdsFacetsMock(...args),
  };
});

vi.mock("@/lib/city/public-city-set", () => ({
  fetchPublicCitySet: (...args: unknown[]) => fetchPublicCitySetMock(...args),
}));

vi.mock("@/lib/env/feature-flags", () => ({
  isRegionalPageEnabled: () => false,
}));

vi.mock("@/lib/seo/site", () => ({
  toAbsoluteUrl: (path: string) => `https://example.test${path}`,
}));

// Stubs identificáveis: o teste procura o catálogo na árvore POR REFERÊNCIA,
// então o objeto importado aqui precisa ser o mesmo que a página importa.
vi.mock("@/components/buy/BuyMarketplacePageClient", () => ({
  default: function BuyMarketplacePageClientStub() {
    return null;
  },
}));

vi.mock("@/components/seo/BreadcrumbJsonLd", () => ({
  default: function BreadcrumbJsonLdStub() {
    return null;
  },
}));

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";

import ComprarNacionalPage, { dynamic, generateMetadata } from "./page";

const AD = {
  id: 101,
  slug: "honda-civic-2020",
  title: "Honda Civic EXL 2020",
  price: 129900,
  brand: "Honda",
  model: "Civic",
  city: "Atibaia",
  state: "SP",
};

const okResults = {
  success: true,
  ok: true,
  data: [AD],
  pagination: { page: 1, limit: 50, total: 28, totalPages: 1 },
  error: null,
};

const okFacets = {
  success: true,
  facets: { brands: [{ brand: "Honda", total: 4 }], models: [], fuelTypes: [], bodyTypes: [] },
};

const DIRECTORY_TESTID = "national-territory-directory";

/** Achata a árvore JSX devolvida pelo Server Component (children aninham arrays). */
function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const element = node as ReactElement;
  if (!("type" in element)) return out;
  out.push(element);
  flatten((element.props as { children?: unknown })?.children, out);
  return out;
}

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  return flatten(await ComprarNacionalPage({ searchParams }));
}

function findCatalog(elements: ReactElement[]): ReactElement | undefined {
  return elements.find((el) => el.type === BuyMarketplacePageClient);
}

function findDirectory(elements: ReactElement[]): ReactElement | undefined {
  return elements.find(
    (el) => (el.props as { "data-testid"?: string })?.["data-testid"] === DIRECTORY_TESTID
  );
}

beforeEach(() => {
  fetchAdsSearchMock.mockResolvedValue(okResults);
  fetchAdsFacetsMock.mockResolvedValue(okFacets);
  fetchPublicCitySetMock.mockResolvedValue({
    cities: { "atibaia-sp": 19, "braganca-paulista-sp": 7, "curitiba-pr": 3 },
    total: 3,
    existsMinAds: 1,
    indexMinAds: 3,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/comprar — configuração da rota", () => {
  it("é force-dynamic (SSR a cada request, sem ISR)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("a página não redireciona: resolve com conteúdo sem território na URL", async () => {
    await expect(ComprarNacionalPage({ searchParams: {} })).resolves.toBeTruthy();
  });

  it("renderiza mesmo com o backend indisponível", async () => {
    fetchPublicCitySetMock.mockResolvedValue(null);
    fetchAdsSearchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    fetchAdsFacetsMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(ComprarNacionalPage({ searchParams: {} })).resolves.toBeTruthy();
  });
});

describe("/comprar — monta o catálogo, não um diretório", () => {
  it("renderiza o BuyMarketplacePageClient compartilhado", async () => {
    expect(findCatalog(await renderPage()), "/comprar precisa montar o catálogo").toBeTruthy();
  });

  it('usa variant="nacional" (H1 "Carros usados no Brasil", busca e breadcrumb nacionais)', async () => {
    expect(findCatalog(await renderPage())?.props.variant).toBe("nacional");
  });

  it("entrega os anúncios no SSR — não deixa a lista para o cliente carregar", async () => {
    const catalog = findCatalog(await renderPage());
    expect(fetchAdsSearchMock).toHaveBeenCalledTimes(1);
    expect(catalog?.props.initialResults.data).toHaveLength(1);
    expect(catalog?.props.initialResults.data[0].slug).toBe("honda-civic-2020");
  });

  it("a contagem vem da resposta real (nunca um 28 hardcodado)", async () => {
    fetchAdsSearchMock.mockResolvedValueOnce({
      ...okResults,
      pagination: { page: 1, limit: 50, total: 7, totalPages: 1 },
    });
    expect(findCatalog(await renderPage())?.props.initialResults.pagination.total).toBe(7);
  });

  it("repassa as facets do SSR para os filtros", async () => {
    expect(findCatalog(await renderPage())?.props.initialFacets.brands).toEqual([
      { brand: "Honda", total: 4 },
    ]);
  });

  it("não liga o redirect por geolocalização", async () => {
    // `GeoToCityRedirect` trocaria o território do visitante no cliente — é o
    // fallback territorial voltando por outra porta.
    expect(findCatalog(await renderPage())?.props.enableGeoRedirect).toBeFalsy();
  });
});

describe("/comprar — território é o Brasil (anti-fallback)", () => {
  it("filtros SSR sem state/city/city_slug/city_id", async () => {
    const filters = findCatalog(await renderPage())?.props.initialFilters;

    expect(filters.state).toBeUndefined();
    expect(filters.city).toBeUndefined();
    expect(filters.city_slug).toBeUndefined();
    expect(filters.city_id).toBeUndefined();
  });

  it("não injeta SP nem atibaia-sp mesmo com todo o estoque numa cidade só", async () => {
    fetchPublicCitySetMock.mockResolvedValueOnce({
      cities: { "atibaia-sp": 28 },
      total: 1,
      existsMinAds: 1,
      indexMinAds: 3,
    });
    const catalog = findCatalog(await renderPage());
    const serialized = JSON.stringify(catalog?.props.initialFilters);

    expect(serialized).not.toMatch(/atibaia/i);
    expect(serialized).not.toMatch(/"state"/);
    // …e a identidade da rota não muda com o conteúdo do estoque.
    expect(catalog?.props.variant).toBe("nacional");
    expect(catalog?.props.city.name).toBe("Brasil");
  });

  it("query com território não recorta o SSR (o 308 do middleware é quem trata)", async () => {
    const catalog = findCatalog(await renderPage({ state: "SP", city_slug: "atibaia-sp" }));
    const [filters] = fetchAdsSearchMock.mock.calls[0];

    expect(filters.state).toBeUndefined();
    expect(filters.city_slug).toBeUndefined();
    expect(catalog?.props.initialFilters.state).toBeUndefined();
  });

  it("o contexto territorial passado ao catálogo é 'Brasil', sem UF nem slug", async () => {
    expect(findCatalog(await renderPage())?.props.city).toMatchObject({
      name: "Brasil",
      state: "",
      slug: "",
    });
  });
});

describe("/comprar — busca, filtros e paginação nacionais", () => {
  it("?q=onix vira busca nacional", async () => {
    await renderPage({ q: "onix" });
    const [filters] = fetchAdsSearchMock.mock.calls[0];
    expect(filters.q).toBe("onix");
    expect(filters.state).toBeUndefined();
  });

  it("?brand=Honda filtra sem injetar território", async () => {
    await renderPage({ brand: "Honda" });
    const [filters] = fetchAdsSearchMock.mock.calls[0];
    expect(filters.brand).toBe("Honda");
    expect(filters.city_slug).toBeUndefined();
  });

  it("?page=2 pede a segunda página, preservando o filtro", async () => {
    await renderPage({ page: "2", brand: "Honda" });
    const [filters] = fetchAdsSearchMock.mock.calls[0];
    expect(filters.page).toBe(2);
    expect(filters.brand).toBe("Honda");
  });
});

describe("/comprar — SEO pela política central", () => {
  it("URL limpa: canonical autorreferente + index,follow", async () => {
    const md = await generateMetadata({ searchParams: {} });
    expect(md.alternates?.canonical).toBe("/comprar");
    expect(md.robots).toMatchObject({ index: true, follow: true });
  });

  it("tem title e description próprios (não herda da home)", async () => {
    const md = await generateMetadata({ searchParams: {} });
    expect(String(md.title).length).toBeGreaterThan(10);
    expect(String(md.description).length).toBeGreaterThan(30);
  });

  it("nunca canonicaliza para cidade ou estado", async () => {
    const canonical = String(
      (await generateMetadata({ searchParams: {} })).alternates?.canonical ?? ""
    );
    expect(canonical).not.toContain("/carros-em/");
    expect(canonical).not.toContain("/carros-usados/");
    expect(canonical).not.toContain("atibaia");
    expect(canonical).not.toContain("city_slug");
  });

  it("filtro é noindex,follow com canonical para a vitrine limpa", async () => {
    const md = await generateMetadata({ searchParams: { brand: "Honda" } });
    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toBe("/comprar");
  });

  it("ordenação é noindex,follow com canonical limpa", async () => {
    const md = await generateMetadata({ searchParams: { sort: "price_asc" } });
    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toBe("/comprar");
  });

  it("paginação é indexável e autocanônica (senão o fim do acervo sai do índice)", async () => {
    const md = await generateMetadata({ searchParams: { page: "2" } });
    expect(md.robots).toMatchObject({ index: true, follow: true });
    expect(md.alternates?.canonical).toBe("/comprar?page=2");
  });

  it("page=1 é a URL limpa escrita de outro jeito — canonical sem query", async () => {
    const md = await generateMetadata({ searchParams: { page: "1" } });
    expect(md.alternates?.canonical).toBe("/comprar");
  });

  it("parâmetro desconhecido não abre superfície indexável nova", async () => {
    const md = await generateMetadata({ searchParams: { xpto: "1" } });
    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toBe("/comprar");
  });

  it("a decisão bate com a política central (sem lista própria de parâmetros)", async () => {
    const { decideSeoQueryPolicy } = await import("@/lib/seo/query-policy");
    for (const params of [
      {},
      { page: "2" },
      { brand: "Honda" },
      { sort: "price_asc" },
      { utm_source: "news" },
    ]) {
      const md = await generateMetadata({ searchParams: params });
      expect(md.robots, JSON.stringify(params)).toMatchObject({
        index: decideSeoQueryPolicy(params).index,
        follow: true,
      });
    }
  });
});

describe("/comprar — diretório territorial vira navegação secundária", () => {
  it("continua presente, com links para estado e cidade", async () => {
    const directory = findDirectory(await renderPage());
    expect(directory, "o diretório territorial deve continuar na página").toBeTruthy();

    const hrefs = flatten(directory)
      .map((el) => (el.props as { href?: string })?.href)
      .filter(Boolean);

    expect(hrefs).toContain("/carros-usados/sp");
    expect(hrefs).toContain("/carros-em/atibaia-sp");
    expect(hrefs).toContain("/carros-em/curitiba-pr");
  });

  it("aparece DEPOIS do catálogo na árvore (nunca no lugar dele)", async () => {
    const elements = await renderPage();
    const catalogAt = elements.findIndex((el) => el.type === BuyMarketplacePageClient);
    const directoryAt = elements.findIndex(
      (el) => (el.props as { "data-testid"?: string })?.["data-testid"] === DIRECTORY_TESTID
    );

    expect(catalogAt).toBeGreaterThan(-1);
    expect(directoryAt).toBeGreaterThan(catalogAt);
  });

  it("conjunto de cidades indisponível some com o diretório, não inventa 'nenhuma cidade'", async () => {
    fetchPublicCitySetMock.mockResolvedValueOnce(null);
    const elements = await renderPage();

    expect(findDirectory(elements)).toBeUndefined();
    // …e o catálogo continua de pé: a falha de um não derruba o outro.
    expect(findCatalog(elements)).toBeTruthy();
  });
});
