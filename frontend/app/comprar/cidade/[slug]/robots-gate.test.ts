/**
 * Gate de indexação de `/comprar/cidade/[slug]` — paridade com as irmãs.
 *
 * Esta rota era a ÚNICA da família territorial sem gate de estoque no robots
 * (auditoria 2026-07-28). Só emitia `noindex` quando havia filtro na URL; na
 * URL limpa não emitia tag `robots` nenhuma, e o default do Next é
 * `index,follow`. Somado ao fallback territorial, virou doorway page: milhares
 * de cidades servindo os anúncios de Atibaia, cada uma se declarando local.
 *
 * A regra travada aqui é a mesma de `shouldIndexLocalSeo`:
 *   indexável ⟺ estoque PRÓPRIO da cidade >= SITEMAP_MIN_ADS
 *
 * "Próprio" é o ponto crítico: conteúdo emprestado pelo fallback nunca pode
 * tornar a página indexável.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/buy/BuyMarketplacePageClient", () => ({ default: () => null }));
vi.mock("@/components/seo/BreadcrumbJsonLd", () => ({ default: () => null }));

vi.mock("@/lib/env/backend-api", () => ({
  resolveBackendApiUrl: vi.fn(() => "https://backend.test/api/public/cities/x"),
  resolveInternalBackendApiUrl: vi.fn(() => "https://backend.test/x"),
  getBackendApiBaseUrl: vi.fn(() => "https://backend.test"),
  getInternalBackendApiBaseUrl: vi.fn(() => ""),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(async () => new Response("{}", { status: 500 })),
}));

vi.mock("@/lib/search/ads-search", () => ({
  fetchAdsSearch: vi.fn(),
  fetchAdsFacets: vi.fn(),
}));

import { fetchAdsSearch } from "@/lib/search/ads-search";
import { generateMetadata } from "./page";

const mockedSearch = vi.mocked(fetchAdsSearch);

function withTotal(total: number) {
  mockedSearch.mockResolvedValue({
    success: true,
    ok: true,
    data: [],
    pagination: { page: 1, limit: 1, total, totalPages: 1 },
    error: null,
  } as never);
}

const SLUG = "atibaia-sp";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SITEMAP_MIN_ADS; // default 3
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gate de estoque no robots", () => {
  it("cidade COM estoque suficiente (>= 3) → index", async () => {
    withTotal(19);
    const meta = await generateMetadata({ params: { slug: SLUG }, searchParams: {} });
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it("cidade no limiar exato (3) → index", async () => {
    withTotal(3);
    const meta = await generateMetadata({ params: { slug: SLUG }, searchParams: {} });
    expect(meta.robots).toMatchObject({ index: true });
  });

  it("cidade com 2 anúncios (abaixo do limiar) → noindex", async () => {
    withTotal(2);
    const meta = await generateMetadata({ params: { slug: SLUG }, searchParams: {} });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("cidade SEM estoque próprio → noindex, mesmo que o fallback vá preencher a página", async () => {
    withTotal(0);
    const meta = await generateMetadata({
      params: { slug: "altaneira-ce" },
      searchParams: {},
    });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("URL LIMPA sempre emite tag robots explícita (antes era ausente ⇒ index por default)", async () => {
    withTotal(0);
    const meta = await generateMetadata({ params: { slug: SLUG }, searchParams: {} });
    expect(meta.robots).toBeDefined();
  });

  it("filtro na URL → noindex mesmo com estoque de sobra", async () => {
    withTotal(19);
    const meta = await generateMetadata({
      params: { slug: SLUG },
      searchParams: { brand: "honda", model: "civic" },
    });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("falha no backend → noindex (o lado seguro do erro)", async () => {
    mockedSearch.mockRejectedValue(new Error("backend fora"));
    const meta = await generateMetadata({ params: { slug: SLUG }, searchParams: {} });
    expect(meta.robots).toMatchObject({ index: false });
  });

  it("conta o estoque da PRÓPRIA cidade pedida, nunca o do doador", async () => {
    withTotal(0);
    await generateMetadata({ params: { slug: "altaneira-ce" }, searchParams: {} });
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ city_slug: "altaneira-ce" })
    );
  });

  it("respeita SITEMAP_MIN_ADS configurável", async () => {
    process.env.SITEMAP_MIN_ADS = "10";
    withTotal(5);
    const meta = await generateMetadata({ params: { slug: SLUG }, searchParams: {} });
    expect(meta.robots).toMatchObject({ index: false });
  });

  it("canonical segue apontando para a irmã canônica", async () => {
    withTotal(19);
    const meta = await generateMetadata({ params: { slug: SLUG }, searchParams: {} });
    expect(meta.alternates?.canonical).toBe(`/carros-em/${SLUG}`);
  });
});
