import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de regressão da configuração e dos gates do segmento da
 * Página Regional `/carros-usados/regiao/[slug]`.
 *
 * Histórico do bug que estes testes existem para prevenir:
 *
 * 1. Inicialmente a rota tinha `export const revalidate = 300`. O Next
 *    14.2 tratava como ISR-able e `notFound()` chamado em Server
 *    Component dessa rota retornava status HTTP 200 com o UI do
 *    not-found global. Reproduzido em produção em 2026-05-10.
 *
 * 2. Fix #1 (commit ce297b2d): troquei para
 *    `export const dynamic = "force-dynamic"`. Smoke contra produção
 *    DEPOIS do redeploy continuou retornando 200 — fix insuficiente.
 *
 * 3. Causa raiz revisada: em Next 14.2 App Router, o ciclo de SSR é:
 *    a. `generateMetadata` é executado primeiro.
 *    b. Next "comita" o status code com base no resultado.
 *    c. `Page` (default) é executado depois.
 *    d. `notFound()` no `Page` troca o BODY (UI not-found) mas é
 *       TARDE para trocar o status — já foi comitado como 200.
 *
 * 4. Fix #2 (este arquivo): `generateMetadata` também chama
 *    `notFound()` nos mesmos pontos. Isso interrompe o pipeline ANTES
 *    do status ser comitado, garantindo 404 real. `Page` mantém os
 *    checks como defesa em profundidade.
 *
 * 5. PR 2 (briefing 2026-05-20): a página passou a usar
 *    `loadRegionalCatalogData` que retorna `null` quando a região
 *    não é resolvível. O contrato 404 permanece o mesmo: flag
 *    desligada OU loader retorna null → `notFound()` em ambos
 *    generateMetadata e Page.
 *
 * Anti-regressão coberta aqui:
 *   - `dynamic === "force-dynamic"` (sem ISR).
 *   - `revalidate` ausente (incompatível com o fix).
 *   - `generateMetadata` chama `notFound()` em todos os cenários
 *     que o `Page` também chama.
 *   - `Page` mantém os checks redundantes.
 *   - Flags `REGIONAL_PAGE_INDEXABLE` e `REGIONAL_PAGE_CANONICAL_SELF`
 *     controlam corretamente `robots` e `canonical` (PR 2).
 */

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/buy/region-catalog-loader", () => ({
  loadRegionalCatalogData: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/seo/site", () => ({
  toAbsoluteUrl: (p: string) => `https://example.test${p}`,
}));

vi.mock("@/lib/env/feature-flags", () => ({
  isRegionalPageEnabled: vi.fn().mockReturnValue(false),
  isRegionalPageIndexable: vi.fn().mockReturnValue(false),
  isRegionalPageCanonicalSelf: vi.fn().mockReturnValue(false),
  shouldIndexRegionalPage: vi.fn().mockReturnValue(false),
  regionalIndexMinAds: vi.fn().mockReturnValue(0),
}));

vi.mock("@/lib/territory/territory-resolver", () => ({
  resolveTerritory: vi.fn().mockResolvedValue({
    level: "region",
    state: { code: "SP", slug: "sp", name: "São Paulo" },
    region: {
      slug: "atibaia-sp",
      name: "Região de Atibaia",
      baseCitySlug: "atibaia-sp",
      citySlugs: ["atibaia-sp"],
      cityNames: ["Atibaia"],
      radiusKm: 80,
    },
    city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
    canonicalUrl: "/carros-usados/regiao/atibaia-sp",
    title: "Carros usados na Região de Atibaia",
    description: "Ofertas em Atibaia e cidades próximas.",
    breadcrumbs: [
      { label: "Início", href: "/" },
      { label: "São Paulo", href: "/comprar/estado/sp" },
      { label: "Região de Atibaia", href: "/carros-usados/regiao/atibaia-sp" },
    ],
  }),
}));

vi.mock("@/lib/regions/regional-facets", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/regions/regional-facets")>();
  return {
    ...actual,
    pickDynamicOgImage: vi.fn().mockReturnValue(null),
  };
});

// Componentes pesados não importam — só precisamos do shape do module.
vi.mock("@/components/buy/BuyMarketplacePageClient", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/territorial/RegionalAuxiliaryBlocks", () => ({
  RegionalAuxiliaryBlocks: () => null,
}));

vi.mock("./RegionFAQ", () => ({
  RegionFAQ: () => null,
}));

vi.mock("@/lib/seo/region-structured-data", () => ({
  buildRegionStructuredDataBlocks: vi.fn().mockReturnValue([]),
}));

import * as pageModule from "./page";

const VALID_CATALOG = {
  region: {
    base: { id: 100, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
    members: [
      {
        city_id: 200,
        slug: "braganca-paulista-sp",
        name: "Bragança Paulista",
        state: "SP",
        layer: 1,
        distance_km: 22.1,
      },
    ],
    radius_km: 80,
  },
  city: {
    slug: "atibaia-sp",
    name: "Atibaia",
    state: "SP",
    label: "Atibaia (SP)",
  },
  stateUf: "SP",
  radiusKm: 80,
  filters: { city_slugs: ["atibaia-sp", "braganca-paulista-sp"], state: "SP" },
  initialResults: {
    success: true,
    ok: true,
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    error: null,
  },
  initialFacets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("segmento /carros-usados/regiao/[slug] — configuração de rendering", () => {
  it("exporta dynamic = 'force-dynamic' (proteção parte 1: rota não-ISR)", () => {
    expect(pageModule.dynamic).toBe("force-dynamic");
  });

  it("NÃO exporta revalidate (incompatível com force-dynamic + notFound 404)", () => {
    expect("revalidate" in pageModule).toBe(false);
  });

  it("exporta generateMetadata como função", () => {
    expect(typeof pageModule.generateMetadata).toBe("function");
  });

  it("exporta default (Page) como função", () => {
    expect(typeof pageModule.default).toBe("function");
  });
});

describe("generateMetadata — gate de status code 404 (proteção parte 2)", () => {
  it("flag ausente → chama notFound() (não retorna metadata)", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(false);

    await expect(
      pageModule.generateMetadata({ params: { slug: "atibaia-sp" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("flag = 'true' + loader retorna null (slug inexistente) → chama notFound()", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { loadRegionalCatalogData } = await import(
      "@/lib/buy/region-catalog-loader"
    );
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(loadRegionalCatalogData).mockResolvedValueOnce(null);

    await expect(
      pageModule.generateMetadata({ params: { slug: "regiao-fake-zz" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});

describe("generateMetadata — flags REGIONAL_PAGE_INDEXABLE + CANONICAL_SELF (PR 2)", () => {
  async function buildMetadata() {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { loadRegionalCatalogData } = await import(
      "@/lib/buy/region-catalog-loader"
    );
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(loadRegionalCatalogData).mockResolvedValueOnce(
      VALID_CATALOG as never
    );

    return pageModule.generateMetadata({ params: { slug: "atibaia-sp" } });
  }

  it("default (ambas as flags false) → noindex + canonical para cidade-base", async () => {
    const { isRegionalPageCanonicalSelf, shouldIndexRegionalPage } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(shouldIndexRegionalPage).mockReturnValue(false);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(false);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-em/atibaia-sp");
    expect(md.alternates?.canonical).not.toContain("/carros-usados/regiao");
  });

  it("INDEXABLE=true sozinha → index, mas canonical permanece para cidade-base", async () => {
    const { isRegionalPageCanonicalSelf, shouldIndexRegionalPage } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(shouldIndexRegionalPage).mockReturnValue(true);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(false);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: true, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-em/atibaia-sp");
  });

  it("CANONICAL_SELF=true sozinha → canonical self, mas noindex permanece", async () => {
    const { isRegionalPageCanonicalSelf, shouldIndexRegionalPage } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(shouldIndexRegionalPage).mockReturnValue(false);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(true);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-usados/regiao/atibaia-sp");
    expect(md.alternates?.canonical).not.toContain("/carros-em/");
  });

  it("ambas true (Fase D plena) → index + canonical self", async () => {
    const { isRegionalPageCanonicalSelf, shouldIndexRegionalPage } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(shouldIndexRegionalPage).mockReturnValue(true);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(true);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: true, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-usados/regiao/atibaia-sp");
  });

  it("title e description seguem o padrão do briefing", async () => {
    const { isRegionalPageCanonicalSelf, shouldIndexRegionalPage } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(shouldIndexRegionalPage).mockReturnValue(true);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(true);

    const md = await buildMetadata();

    expect(md.title).toBe("Carros usados em Atibaia e região | Carros na Cidade");
    expect(md.description).toBe(
      "Veja ofertas de carros usados em Atibaia e cidades próximas. Compare veículos de lojas e particulares na região."
    );
  });
});

describe("Page (default export) — defesa em profundidade", () => {
  it("flag false → notFound() (segundo gate; primeiro é em generateMetadata)", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(false);

    await expect(
      pageModule.default({ params: { slug: "atibaia-sp" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("flag true + loader retorna null → notFound()", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { loadRegionalCatalogData } = await import(
      "@/lib/buy/region-catalog-loader"
    );
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(loadRegionalCatalogData).mockResolvedValueOnce(null);

    await expect(
      pageModule.default({ params: { slug: "regiao-fake-zz" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
