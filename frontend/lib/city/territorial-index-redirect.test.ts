import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPublicCitySet: vi.fn() }));

vi.mock("@/lib/city/public-city-set", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/city/public-city-set")>();
  return { ...actual, fetchPublicCitySet: mocks.fetchPublicCitySet };
});

const { resolveTerritorialIndexTarget, TERRITORIAL_INDEX_FALLBACK } = await import(
  "@/lib/city/territorial-index-redirect"
);

/**
 * Destino das rotas-índice territoriais — SEO Fase 4.1A, achado P1-3.
 *
 * `/tabela-fipe` mandava para `/tabela-fipe/${cookie ?? "sao-paulo-sp"}`. Sem
 * cookie o destino era São Paulo, cidade com zero anúncios ativos: 404. E a URL
 * de origem estava listada em `core.xml`.
 */

function set(cities: Record<string, number>, primarySlug: string | null) {
  return {
    cities,
    total: Object.keys(cities).length,
    existsMinAds: 1,
    indexMinAds: 3,
    primaryCity: primarySlug
      ? { slug: primarySlug, uf: "SP", activeAds: cities[primarySlug] }
      : null,
  };
}

beforeEach(() => {
  mocks.fetchPublicCitySet.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveTerritorialIndexTarget", () => {
  it("cookie de cidade PÚBLICA vence", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(
      set({ "atibaia-sp": 27, "campinas-sp": 10 }, "atibaia-sp")
    );

    expect(await resolveTerritorialIndexTarget("tabela-fipe", "campinas-sp")).toBe(
      "/tabela-fipe/campinas-sp"
    );
  });

  it("cookie de cidade que PERDEU o estoque é descartado — era a origem do 404", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({ "atibaia-sp": 27 }, "atibaia-sp"));

    expect(await resolveTerritorialIndexTarget("tabela-fipe", "altaneira-ce")).toBe(
      "/tabela-fipe/atibaia-sp"
    );
  });

  it("sem cookie usa a cidade pública primária — nunca `sao-paulo-sp` fixo", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({ "atibaia-sp": 27 }, "atibaia-sp"));

    const target = await resolveTerritorialIndexTarget("tabela-fipe", null);
    expect(target).toBe("/tabela-fipe/atibaia-sp");
    expect(target).not.toContain("sao-paulo-sp");
  });

  it("ZERO cidades públicas → rota genérica, sem slug inventado", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({}, null));

    const target = await resolveTerritorialIndexTarget("tabela-fipe", null);
    expect(target).toBe(TERRITORIAL_INDEX_FALLBACK);
    expect(target).toBe("/comprar");
    expect(target).not.toContain("sao-paulo-sp");
  });

  it("ZERO cidades públicas ignora até um cookie — o cookie não prova estoque", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({}, null));

    expect(await resolveTerritorialIndexTarget("tabela-fipe", "sao-paulo-sp")).toBe("/comprar");
  });

  it("backend indisponível (null) cai na rota genérica, não em palpite", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(null);

    expect(await resolveTerritorialIndexTarget("simulador-financiamento", "atibaia-sp")).toBe(
      "/comprar"
    );
  });

  it("vale para o simulador com o mesmo prefixo passado", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({ "atibaia-sp": 27 }, "atibaia-sp"));

    expect(await resolveTerritorialIndexTarget("simulador-financiamento", null)).toBe(
      "/simulador-financiamento/atibaia-sp"
    );
  });

  it("slug com caractere especial é encodado", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({ "sao-jose-sp": 5 }, "sao-jose-sp"));

    expect(await resolveTerritorialIndexTarget("tabela-fipe", null)).toBe(
      "/tabela-fipe/sao-jose-sp"
    );
  });
});
