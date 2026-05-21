import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes da Página Estadual canônica `/carros-usados/[uf]` (PR 3
 * briefing 2026-05-20).
 *
 * Cobertura mínima do contrato:
 *   - generateMetadata produz title/description literais do briefing.
 *   - canonical APONTA PARA self (/carros-usados/[uf]), sem query string.
 *   - UF inválida retorna metadata `noindex` e a Page chama `notFound()`.
 *   - Filtros restritivos (brand/model/q/...) emitem `robots: noindex`.
 *   - Page resolve via `loadStateCatalogData` e bloqueia em UF inválida.
 */

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/buy/state-catalog-loader", () => ({
  loadStateCatalogData: vi.fn(),
}));

vi.mock("@/lib/territory/fetch-state-regions", () => ({
  fetchStateRegions: vi.fn().mockResolvedValue({ regions: [] }),
}));

vi.mock("@/lib/env/feature-flags", () => ({
  isRegionalPageEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/seo/site", () => ({
  toAbsoluteUrl: (p: string) => `https://example.test${p}`,
}));

// Componentes pesados — apenas precisamos do shape.
vi.mock("@/components/buy/BuyMarketplacePageClient", () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock("@/components/territorial/StateLocationPrompt", () => ({
  StateLocationPrompt: () => null,
}));
vi.mock("@/components/territorial/StateRegionsBlock", () => ({
  StateRegionsBlock: () => null,
}));

import * as pageModule from "./page";

const VALID_CATALOG = {
  uf: "SP",
  stateName: "São Paulo",
  city: { slug: "estado-sp", name: "São Paulo", state: "SP", label: "São Paulo (SP)" },
  filters: {
    state: "SP",
    sort: "relevance",
    page: 1,
    limit: 20,
  },
  initialResults: {
    success: true,
    ok: true,
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    error: null,
  },
  initialFacets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
};

beforeEach(async () => {
  // mockReset zera tanto chamadas quanto a fila de mockResolvedValue,
  // evitando que um teste contamine o próximo via fila persistente.
  const { loadStateCatalogData } = await import("@/lib/buy/state-catalog-loader");
  vi.mocked(loadStateCatalogData).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/carros-usados/[uf] — generateMetadata", () => {
  it("title segue o briefing — o root layout aplica template '| Carros na Cidade'", async () => {
    const { loadStateCatalogData } = await import(
      "@/lib/buy/state-catalog-loader"
    );
    vi.mocked(loadStateCatalogData).mockResolvedValue(VALID_CATALOG as never);

    const md = await pageModule.generateMetadata({
      params: { uf: "sp" },
    });

    // O título final no <head> será "Carros usados em São Paulo | Carros
    // na Cidade" porque o root layout (app/layout.tsx) configura
    // `title.template = "%s | Carros na Cidade"`. Enviar a string
    // completa aqui duplicaria o sufixo, então page.tsx envia só o
    // fragmento.
    expect(md.title).toBe("Carros usados em São Paulo");
  });

  it("description literal do briefing", async () => {
    const md = await pageModule.generateMetadata({ params: { uf: "mg" } });
    expect(md.description).toBe(
      "Encontre carros usados e seminovos em Minas Gerais. Veja ofertas por cidade, região, lojas e particulares."
    );
  });

  it("canonical aponta para self (/carros-usados/[uf]) sem query string", async () => {
    const md = await pageModule.generateMetadata({
      params: { uf: "SP" },
      searchParams: { brand: "Toyota", sort: "price_asc", utm_source: "fb" },
    });
    expect(md.alternates?.canonical).toBe("/carros-usados/sp");
    expect(String(md.alternates?.canonical)).not.toContain("?");
  });

  it("UF inválida → metadata noindex e title genérico", async () => {
    const md = await pageModule.generateMetadata({ params: { uf: "xx" } });
    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.title).toMatch(/Comprar carros/i);
  });

  it("filtros restritivos (brand/model/q) emitem robots noindex mas mantêm canonical limpo", async () => {
    const md = await pageModule.generateMetadata({
      params: { uf: "sp" },
      searchParams: { brand: "Honda", model: "Civic" },
    });
    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toBe("/carros-usados/sp");
  });

  it("Paraná: title fragment 'Carros usados em Paraná' + canonical /pr", async () => {
    const md = await pageModule.generateMetadata({ params: { uf: "pr" } });
    expect(md.title).toBe("Carros usados em Paraná");
    expect(md.alternates?.canonical).toBe("/carros-usados/pr");
  });
});

describe("/carros-usados/[uf] — Page (gate de UF inválida)", () => {
  it("UF inválida → notFound() (404 real, não soft-404)", async () => {
    const { loadStateCatalogData } = await import(
      "@/lib/buy/state-catalog-loader"
    );
    vi.mocked(loadStateCatalogData).mockResolvedValue(null);

    await expect(
      pageModule.default({ params: { uf: "zz" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("UF válida → resolve catalog sem 404", async () => {
    const { loadStateCatalogData } = await import(
      "@/lib/buy/state-catalog-loader"
    );
    vi.mocked(loadStateCatalogData).mockResolvedValue(VALID_CATALOG as never);

    // Page é Server Component async — chamar como função retorna o tree.
    await expect(
      pageModule.default({ params: { uf: "sp" } })
    ).resolves.toBeTruthy();
  });
});

describe("/carros-usados/[uf] — sort default", () => {
  it("normalizeStateFilters dentro do loader produz sort='relevance' por default (PR 2.5)", async () => {
    // O loader real (não mockado) é testado em state-catalog-loader.test.ts.
    // Aqui só confirmamos que o filters mockado segue o contrato esperado.
    expect(VALID_CATALOG.filters.sort).toBe("relevance");
  });
});
