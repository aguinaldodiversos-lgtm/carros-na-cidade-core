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
 * Anti-regressão coberta aqui:
 *   - `dynamic === "force-dynamic"` (sem ISR).
 *   - `revalidate` ausente (incompatível com o fix).
 *   - `generateMetadata` chama `notFound()` em todos os cenários
 *     que o `Page` também chama.
 *   - `Page` mantém os checks redundantes.
 *   - Flags `REGIONAL_PAGE_INDEXABLE` e `REGIONAL_PAGE_CANONICAL_SELF`
 *     controlam corretamente `robots` e `canonical` (PR 2).
 */

// `React.cache` faz parte do Server Components runtime — em ambiente
// Node de teste ele simplesmente não está disponível. Stub: identidade.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    // Em produção, notFound() lança um erro especial que Next intercepta
    // e converte em response 404. Aqui usamos uma sentinel previsível.
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/regions/fetch-region", () => ({
  fetchRegionByCitySlug: vi.fn().mockResolvedValue(null),
  regionToAdsSearchFilters: vi.fn().mockReturnValue({ city_slugs: [] }),
}));

vi.mock("@/lib/search/ads-search", () => ({
  fetchAdsSearch: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));

vi.mock("@/lib/seo/site", () => ({
  toAbsoluteUrl: (p: string) => `https://example.test${p}`,
}));

vi.mock("@/lib/env/feature-flags", () => ({
  isRegionalPageEnabled: vi.fn().mockReturnValue(false),
  isRegionalPageIndexable: vi.fn().mockReturnValue(false),
  isRegionalPageCanonicalSelf: vi.fn().mockReturnValue(false),
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

vi.mock("./region-page-view", () => ({
  RegionPageView: () => null,
}));

import * as pageModule from "./page";

const VALID_REGION = {
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

  it("flag = 'true' + region null (slug inexistente) → chama notFound()", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { fetchRegionByCitySlug } = await import("@/lib/regions/fetch-region");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(fetchRegionByCitySlug).mockResolvedValueOnce(null);

    await expect(
      pageModule.generateMetadata({ params: { slug: "regiao-fake-zz" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("flag = 'true' + region.base ausente → chama notFound()", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { fetchRegionByCitySlug } = await import("@/lib/regions/fetch-region");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(fetchRegionByCitySlug).mockResolvedValueOnce({
      base: null,
      members: [],
    } as unknown as null);

    await expect(
      pageModule.generateMetadata({ params: { slug: "atibaia-sp" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});

describe("generateMetadata — flags REGIONAL_PAGE_INDEXABLE + CANONICAL_SELF (PR 2)", () => {
  async function buildMetadata() {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { fetchRegionByCitySlug } = await import("@/lib/regions/fetch-region");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(fetchRegionByCitySlug).mockResolvedValueOnce(VALID_REGION as never);

    return pageModule.generateMetadata({ params: { slug: "atibaia-sp" } });
  }

  it("default (ambas as flags false) → noindex + canonical para cidade-base", async () => {
    const { isRegionalPageIndexable, isRegionalPageCanonicalSelf } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(isRegionalPageIndexable).mockReturnValue(false);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(false);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-em/atibaia-sp");
    expect(md.alternates?.canonical).not.toContain("/carros-usados/regiao");
  });

  it("INDEXABLE=true sozinha → index, mas canonical permanece para cidade-base", async () => {
    const { isRegionalPageIndexable, isRegionalPageCanonicalSelf } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(isRegionalPageIndexable).mockReturnValue(true);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(false);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: true, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-em/atibaia-sp");
  });

  it("CANONICAL_SELF=true sozinha → canonical self, mas noindex permanece", async () => {
    const { isRegionalPageIndexable, isRegionalPageCanonicalSelf } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(isRegionalPageIndexable).mockReturnValue(false);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(true);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-usados/regiao/atibaia-sp");
    expect(md.alternates?.canonical).not.toContain("/carros-em/");
  });

  it("ambas true (Fase D plena) → index + canonical self", async () => {
    const { isRegionalPageIndexable, isRegionalPageCanonicalSelf } = await import(
      "@/lib/env/feature-flags"
    );
    vi.mocked(isRegionalPageIndexable).mockReturnValue(true);
    vi.mocked(isRegionalPageCanonicalSelf).mockReturnValue(true);

    const md = await buildMetadata();

    expect(md.robots).toMatchObject({ index: true, follow: true });
    expect(md.alternates?.canonical).toContain("/carros-usados/regiao/atibaia-sp");
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

  it("flag true + region null → notFound()", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { fetchRegionByCitySlug } = await import("@/lib/regions/fetch-region");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(fetchRegionByCitySlug).mockResolvedValueOnce(null);

    await expect(
      pageModule.default({ params: { slug: "regiao-fake-zz" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("flag true + region.base ausente → notFound()", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { fetchRegionByCitySlug } = await import("@/lib/regions/fetch-region");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(fetchRegionByCitySlug).mockResolvedValueOnce({
      base: null,
      members: [],
    } as unknown as null);

    await expect(
      pageModule.default({ params: { slug: "atibaia-sp" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
