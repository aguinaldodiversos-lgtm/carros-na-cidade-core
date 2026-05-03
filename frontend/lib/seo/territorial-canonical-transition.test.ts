import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerritorialPagePayload } from "@/lib/search/territorial-public";

/**
 * Integração da Fase 1 da auditoria territorial:
 * (docs/runbooks/territorial-canonical-audit.md §6/§7)
 *
 * Cobre os 4 page.tsx que constroem `<link rel="canonical">` a partir de
 * helpers próprios de transição:
 *   1. /comprar/cidade/[slug]              → canonical /carros-em/[slug] (limpo)
 *   2. /cidade/[slug]                       → canonical /carros-em/[slug]
 *   3. /cidade/[slug]/oportunidades         → canonical /carros-baratos-em/[slug]
 *   4. /cidade/[slug]/abaixo-da-fipe        → canonical /carros-baratos-em/[slug]
 *
 * Os outros 3 routes (/carros-em, /carros-baratos-em, /carros-automaticos-em)
 * passam por buildLocalSeoMetadata, coberto por local-seo-metadata.test.ts.
 *
 * Mock surface mínima — só o que faz I/O ou puxa server-only:
 *   - server-only (stub vazio)
 *   - @/lib/env/backend-api → resolveBackendApiUrl=null (resolveCityMeta degrade)
 *   - @/lib/net/ssr-resilient-fetch
 *   - @/lib/search/territorial-public (data fetcher das páginas /cidade/*)
 *   - components pesados (não importam pra test)
 */

vi.mock("server-only", () => ({}));

// `cache` é API de React Server Components — em vitest node, vira undefined.
// Usamos passthrough (sem memoização) para os testes.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  };
});

vi.mock("@/lib/env/backend-api", () => ({
  resolveBackendApiUrl: vi.fn(() => null),
  getBackendApiBaseUrl: vi.fn(() => ""),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

/**
 * Stub de payload territorial fiel ao backend real (capturado via curl em
 * /api/public/cities/atibaia-sp em 2026-05-03):
 *   - seo.title já vem com sufixo "| Carros na Cidade" → exercita stripSiteTitleSuffix
 *   - seo.robots = "index,follow" → backend NÃO força noindex
 *   - filters.sort = "highlight" → shouldIndexTerritorialPage retorna false
 *     (sort/order != null derruba index pra evitar variantes de ordenação no SERP)
 *   - filters.highlight_only / city_slug → keys comportadas
 */
function buildTerritorialPayload(slug: string, canonicalFromBackend: string): TerritorialPagePayload {
  return {
    city: { id: 1, name: "Atibaia", slug, state: "SP", region: null },
    brand: null,
    model: null,
    filters: {
      page: 1,
      limit: 12,
      sort: "highlight",
      highlight_only: true,
      city_slug: slug,
    },
    pagination: {},
    sections: { recentAds: [] },
    facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
    stats: {},
    seo: {
      title: "Carros em Atibaia - SP | Carros na Cidade",
      description: "Catálogo de carros em Atibaia.",
      canonicalPath: canonicalFromBackend,
      robots: "index,follow",
    },
  } as unknown as TerritorialPagePayload;
}

vi.mock("@/lib/search/territorial-public", () => ({
  fetchCityTerritorialPage: vi.fn(async (slug: string) =>
    buildTerritorialPayload(slug, `/cidade/${slug}`)
  ),
  fetchCityOpportunitiesTerritorialPage: vi.fn(async (slug: string) =>
    buildTerritorialPayload(slug, `/cidade/${slug}/oportunidades`)
  ),
  fetchCityBelowFipeTerritorialPage: vi.fn(async (slug: string) =>
    buildTerritorialPayload(slug, `/cidade/${slug}/abaixo-da-fipe`)
  ),
}));

// Componentes não são exercitados nestes testes — stub para não puxar React DOM.
vi.mock("@/components/buy/BuyMarketplacePageClient", () => ({
  default: () => null,
}));
vi.mock("@/components/seo/BreadcrumbJsonLd", () => ({
  default: () => null,
}));
vi.mock("@/components/search/TerritorialResultsPageClient", () => ({
  TerritorialResultsPageClient: () => null,
}));
vi.mock("@/components/seo/TerritorialSeoJsonLd", () => ({
  TerritorialSeoJsonLd: () => null,
}));

import { generateMetadata as generateMetadataComprarCidade } from "@/app/comprar/cidade/[slug]/page";
import { generateMetadata as generateMetadataCidade } from "@/app/cidade/[slug]/page";
import { generateMetadata as generateMetadataOportunidades } from "@/app/cidade/[slug]/oportunidades/page";
import { generateMetadata as generateMetadataBelowFipe } from "@/app/cidade/[slug]/abaixo-da-fipe/page";

const SLUG = "atibaia-sp";

beforeEach(() => {
  // Cada teste começa com env limpa.
  delete process.env.INTERNAL_API_TOKEN;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/comprar/cidade/[slug] — generateMetadata (Fase 1)", () => {
  it("canonical = /carros-em/[slug] (URL LIMPA, sem query string mesmo com searchParams agressivos)", async () => {
    const meta = await generateMetadataComprarCidade({
      params: { slug: SLUG },
      searchParams: {
        sort: "recent",
        limit: "50",
        page: "3",
        brand: "honda",
        model: "civic",
        utm_source: "google",
      },
    });

    expect(meta.alternates?.canonical).toBe(`/carros-em/${SLUG}`);
    const canonical = String(meta.alternates?.canonical || "");
    expect(canonical).not.toContain("?");
    expect(canonical).not.toMatch(/sort|limit|page|utm|honda|civic/i);
  });

  it("title NÃO termina com '| Carros na Cidade' (template do RootLayout adiciona)", async () => {
    const meta = await generateMetadataComprarCidade({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
  });
});

describe("/cidade/[slug] — generateMetadata (Fase 1)", () => {
  it("canonical = /carros-em/[slug] (consolida sinal na canônica intermediária)", async () => {
    const meta = await generateMetadataCidade({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(meta.alternates?.canonical).toBe(
      `https://carrosnacidade.com/carros-em/${SLUG}`
    );
  });

  it("robots permanecem noindex,follow (backend devolve robots:'noindex,follow')", async () => {
    const meta = await generateMetadataCidade({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("title sem duplicação (strip do sufixo aplicado em territorial-seo)", async () => {
    const meta = await generateMetadataCidade({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
  });
});

describe("/cidade/[slug]/oportunidades — generateMetadata (Fase 1)", () => {
  it("canonical = /carros-baratos-em/[slug] (deduplicação semântica de 'oportunidades' e 'abaixo-da-fipe')", async () => {
    const meta = await generateMetadataOportunidades({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(meta.alternates?.canonical).toBe(
      `https://carrosnacidade.com/carros-baratos-em/${SLUG}`
    );
  });

  it("robots permanecem noindex,follow", async () => {
    const meta = await generateMetadataOportunidades({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });
});

describe("/cidade/[slug]/abaixo-da-fipe — generateMetadata (Fase 1)", () => {
  it("canonical = /carros-baratos-em/[slug] (override adicionado nesta fase; antes vinha de data.seo.canonicalPath)", async () => {
    const meta = await generateMetadataBelowFipe({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(meta.alternates?.canonical).toBe(
      `https://carrosnacidade.com/carros-baratos-em/${SLUG}`
    );
  });

  it("robots permanecem noindex,follow", async () => {
    const meta = await generateMetadataBelowFipe({
      params: { slug: SLUG },
      searchParams: {},
    });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });
});

describe("Fase 1 — invariantes globais (todas as 4 páginas)", () => {
  it("nenhuma rota emite canonical com query string (sort/limit/page/utm/filtros)", async () => {
    const metas = await Promise.all([
      generateMetadataComprarCidade({
        params: { slug: SLUG },
        searchParams: { sort: "recent", limit: "50", utm_source: "x" },
      }),
      generateMetadataCidade({ params: { slug: SLUG }, searchParams: {} }),
      generateMetadataOportunidades({ params: { slug: SLUG }, searchParams: {} }),
      generateMetadataBelowFipe({ params: { slug: SLUG }, searchParams: {} }),
    ]);

    for (const meta of metas) {
      const canonical = String(meta.alternates?.canonical || "");
      expect(canonical).not.toContain("?");
      expect(canonical).not.toMatch(/sort|limit|utm/i);
    }
  });

  it("nenhuma rota duplica o sufixo '| Carros na Cidade' no title (RootLayout cuida via title.template)", async () => {
    const metas = await Promise.all([
      generateMetadataComprarCidade({ params: { slug: SLUG }, searchParams: {} }),
      generateMetadataCidade({ params: { slug: SLUG }, searchParams: {} }),
      generateMetadataOportunidades({ params: { slug: SLUG }, searchParams: {} }),
      generateMetadataBelowFipe({ params: { slug: SLUG }, searchParams: {} }),
    ]);

    for (const meta of metas) {
      expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    }
  });
});
