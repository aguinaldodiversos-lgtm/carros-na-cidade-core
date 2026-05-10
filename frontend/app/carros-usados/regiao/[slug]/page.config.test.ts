import { describe, expect, it, vi } from "vitest";

/**
 * Testes de regressão de configuração do segmento da Página Regional.
 *
 * Por que um teste para `export const dynamic`?
 * - Em 2026-05 detectamos que `export const revalidate = N` na rota
 *   regional fazia o Next 14.2 servir `notFound()` com status HTTP 200
 *   (o conteúdo do `not-found.tsx` global era enviado, mas o status
 *   code não era 404). Isso furava a proteção da feature flag em
 *   produção e gerava o risco de slugs inexistentes serem servidos
 *   como 200 (com noindex, mas ainda assim 200).
 *
 * - O fix foi trocar para `export const dynamic = "force-dynamic"` e
 *   remover `revalidate`. Este teste impede regressão: se alguém
 *   reintroduzir `revalidate` ou remover `dynamic`, a suíte falha
 *   ANTES do bug voltar para produção.
 *
 * Mocks necessários para o teste apenas IMPORTAR a página sem rodar:
 *   - Server components importados (e seus deps) precisam ser
 *     resolvidos. `server-only` já tem alias no vitest.config.ts.
 *     O resto é mockado abaixo para o módulo carregar sem precisar
 *     de fetch real.
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
}));

vi.mock("./region-page-view", () => ({
  RegionPageView: () => null,
}));

import * as pageModule from "./page";

describe("segmento /carros-usados/regiao/[slug] — configuração de rendering", () => {
  it("exporta dynamic = 'force-dynamic' (proteção contra regressão NEXT_NOT_FOUND→200)", () => {
    // O símbolo precisa existir e ser exatamente "force-dynamic".
    // Qualquer outro valor ("auto", "error", undefined) permite o Next
    // tratar como ISR-able e quebrar notFound() → 404 em prod.
    expect(pageModule.dynamic).toBe("force-dynamic");
  });

  it("NÃO exporta revalidate (incompatível com force-dynamic + notFound 404)", () => {
    // `export const revalidate` reintroduzido junto com dynamic causaria
    // warning do Next e potencial regressão do status code.
    expect("revalidate" in pageModule).toBe(false);
  });

  it("exporta generateMetadata como função", () => {
    expect(typeof pageModule.generateMetadata).toBe("function");
  });

  it("exporta default (Page) como função", () => {
    expect(typeof pageModule.default).toBe("function");
  });
});

describe("segmento /carros-usados/regiao/[slug] — gate por flag", () => {
  it("Page com flag false dispara notFound() (lança NEXT_NOT_FOUND)", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(false);

    await expect(
      pageModule.default({ params: { slug: "atibaia-sp" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("Page com flag true mas region null dispara notFound()", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    const { fetchRegionByCitySlug } = await import("@/lib/regions/fetch-region");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(true);
    vi.mocked(fetchRegionByCitySlug).mockResolvedValueOnce(null);

    await expect(
      pageModule.default({ params: { slug: "regiao-fake-zz" } })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("generateMetadata com flag false retorna robots noindex+nofollow (defesa em profundidade)", async () => {
    const { isRegionalPageEnabled } = await import("@/lib/env/feature-flags");
    vi.mocked(isRegionalPageEnabled).mockReturnValue(false);

    const md = await pageModule.generateMetadata({ params: { slug: "atibaia-sp" } });
    // Quando flag off, o metadata NÃO pode produzir canonical útil — só
    // robots de proteção. notFound() vem do default export; metadata
    // adicional é defesa em profundidade caso o Next sirva metadata
    // antes do default no future.
    expect(md.robots).toMatchObject({ index: false, follow: false });
  });
});
