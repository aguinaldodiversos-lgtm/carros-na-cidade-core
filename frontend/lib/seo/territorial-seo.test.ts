import { describe, expect, it } from "vitest";
import { buildTerritorialJsonLd, buildTerritorialMetadata } from "./territorial-seo";
import type { TerritorialPagePayload } from "../search/territorial-public";

const baseData: TerritorialPagePayload = {
  city: { id: 1, name: "Atibaia", slug: "atibaia-sp", state: "SP", region: null },
  brand: null,
  model: null,
  filters: {},
  pagination: {},
  sections: { recentAds: [] },
  facets: { brands: [], models: [], fuelTypes: [], bodyTypes: [] },
  stats: {},
  seo: {
    title: "Carros em Atibaia",
    description: "Catálogo de carros em Atibaia.",
    canonicalPath: "/cidade/atibaia-sp",
    robots: "index,follow",
  },
} as unknown as TerritorialPagePayload;

describe("buildTerritorialMetadata canonical override (transição)", () => {
  it("usa data.seo.canonicalPath quando override não é passado (comportamento legado)", () => {
    const meta = buildTerritorialMetadata(baseData, "city");
    expect(meta.alternates?.canonical).toBe("https://carrosnacidade.com/cidade/atibaia-sp");
  });

  it("usa canonicalPathOverride quando passado (caso /cidade/[slug] → /comprar/cidade/[slug])", () => {
    const meta = buildTerritorialMetadata(baseData, "city", {
      canonicalPathOverride: "/comprar/cidade/atibaia-sp",
    });
    expect(meta.alternates?.canonical).toBe("https://carrosnacidade.com/comprar/cidade/atibaia-sp");
  });

  it("override também propaga para openGraph.url para consistência SEO", () => {
    const meta = buildTerritorialMetadata(baseData, "city", {
      canonicalPathOverride: "/comprar/cidade/atibaia-sp",
    });
    expect(meta.openGraph?.url).toBe("https://carrosnacidade.com/comprar/cidade/atibaia-sp");
  });

  it("aplica forceNoindex quando solicitado, mantendo follow", () => {
    const meta = buildTerritorialMetadata(baseData, "city", { forceNoindex: true });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("/cidade/[slug]/oportunidades canonicaliza para /cidade/[slug]/abaixo-da-fipe", () => {
    const oppData = {
      ...baseData,
      seo: { ...baseData.seo, canonicalPath: "/cidade/atibaia-sp/oportunidades" },
    } as TerritorialPagePayload;

    const meta = buildTerritorialMetadata(oppData, "opportunities", {
      canonicalPathOverride: "/cidade/atibaia-sp/abaixo-da-fipe",
    });

    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/cidade/atibaia-sp/abaixo-da-fipe"
    );
  });
});

describe("buildTerritorialMetadata — title NÃO duplica sufixo do site", () => {
  it("strip do sufixo '| Carros na Cidade' quando backend já incluiu (evita dupla concatenação contra title.template do RootLayout)", () => {
    const data = {
      ...baseData,
      seo: { ...baseData.seo, title: "Carros em Atibaia - SP | Carros na Cidade" },
    } as TerritorialPagePayload;

    const meta = buildTerritorialMetadata(data, "city");

    expect(String(meta.title)).toBe("Carros em Atibaia - SP");
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
  });

  it("strip case-insensitive (sufixo com casing inconsistente também é removido)", () => {
    const data = {
      ...baseData,
      seo: { ...baseData.seo, title: "Carros em Atibaia | CARROS NA CIDADE" },
    } as TerritorialPagePayload;

    expect(String(buildTerritorialMetadata(data, "city").title)).toBe("Carros em Atibaia");
  });

  it("preserva o título quando o backend NÃO inclui o sufixo (template do layout cuida)", () => {
    const data = {
      ...baseData,
      seo: { ...baseData.seo, title: "Carros em Atibaia - SP" },
    } as TerritorialPagePayload;

    expect(String(buildTerritorialMetadata(data, "city").title)).toBe("Carros em Atibaia - SP");
  });

  it("fallback defensivo: título que SÓ contém o sufixo é preservado (não devolve string vazia)", () => {
    const data = {
      ...baseData,
      seo: { ...baseData.seo, title: "| Carros na Cidade" },
    } as TerritorialPagePayload;

    // Strip resultaria em "" — fallback preserva o original.
    expect(String(buildTerritorialMetadata(data, "city").title).length).toBeGreaterThan(0);
  });
});

describe("buildTerritorialMetadata — indexação dinâmica por estoque (2026-06-26)", () => {
  function withSeo(extra: Record<string, unknown>): TerritorialPagePayload {
    return { ...baseData, seo: { ...baseData.seo, ...extra } } as TerritorialPagePayload;
  }

  it("marca COM estoque ativo (index,follow + activeCount>0) → index true, canonical self", () => {
    const data = withSeo({
      canonicalPath: "/cidade/atibaia-sp/marca/fiat/modelo/argo",
      robots: "index,follow",
      indexable: true,
      hasActiveInventory: true,
      activeCount: 5,
      noindexReason: null,
    });

    const meta = buildTerritorialMetadata(data, "model");
    expect(meta.robots).toMatchObject({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo"
    );
  });

  it("backend manda noindex,follow → index false, follow true", () => {
    const data = withSeo({ robots: "noindex,follow", hasActiveInventory: false, activeCount: 0 });
    const meta = buildTerritorialMetadata(data, "brand");
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("defesa: hasActiveInventory false força noindex mesmo se robots vier index", () => {
    const data = withSeo({ robots: "index,follow", hasActiveInventory: false, activeCount: 0 });
    expect(buildTerritorialMetadata(data, "brand").robots).toMatchObject({ index: false });
  });

  it("defesa: activeCount 0 força noindex", () => {
    const data = withSeo({ robots: "index,follow", activeCount: 0 });
    expect(buildTerritorialMetadata(data, "brand").robots).toMatchObject({ index: false });
  });

  it("defesa: noindexReason presente força noindex", () => {
    const data = withSeo({ robots: "index,follow", noindexReason: "backend_unavailable" });
    expect(buildTerritorialMetadata(data, "model").robots).toMatchObject({ index: false });
  });

  it("fallback de erro (canonical self + noindex) NÃO canonicaliza para home", () => {
    const data = withSeo({
      canonicalPath: "/cidade/atibaia-sp/marca/fiat",
      robots: "noindex,follow",
      noindexReason: "not_found",
      hasActiveInventory: false,
      activeCount: 0,
    });
    const meta = buildTerritorialMetadata(data, "brand");
    expect(meta.alternates?.canonical).toBe("https://carrosnacidade.com/cidade/atibaia-sp/marca/fiat");
    expect(meta.alternates?.canonical).not.toBe("https://carrosnacidade.com/");
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });
});

describe("buildTerritorialJsonLd canonical override", () => {
  it("usa data.seo.canonicalPath quando override é omitido", () => {
    const jsonLd = buildTerritorialJsonLd(baseData, "city") as { url?: string };
    expect(jsonLd.url).toBe("https://carrosnacidade.com/cidade/atibaia-sp");
  });

  it("usa canonicalPathOverride no campo url do JSON-LD", () => {
    const jsonLd = buildTerritorialJsonLd(baseData, "city", {
      canonicalPathOverride: "/comprar/cidade/atibaia-sp",
    }) as { url?: string };
    expect(jsonLd.url).toBe("https://carrosnacidade.com/comprar/cidade/atibaia-sp");
  });
});
