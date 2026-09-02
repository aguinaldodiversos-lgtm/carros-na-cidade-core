import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CityRef } from "@/lib/city/city-types";

const mocks = vi.hoisted(() => ({ fetchPublicCitySet: vi.fn() }));

vi.mock("@/lib/city/public-city-set", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/city/public-city-set")>();
  return { ...actual, fetchPublicCitySet: mocks.fetchPublicCitySet };
});

const { resolveCookieOrPrimaryCity, resolvePublicDefaultCity } = await import(
  "@/lib/city/public-default-city"
);

/**
 * Cidade do SSR — o cookie também passa pelo conjunto público.
 *
 * ── O defeito que estes testes travam (validação 4.1A, 2026-09-02) ───────────
 * `app/layout.tsx` confiava no cookie sem conferir estoque. Medido no build
 * local com `cnc_city = altaneira-ce`: o HTML de SSR saía com
 * `/carros-em/altaneira-ce`, `/carros-baratos-em/altaneira-ce`,
 * `/tabela-fipe/altaneira-ce` e `/blog/altaneira-ce` — todos 404.
 *
 * O `CityContext` já descartava a cidade morta, mas só DEPOIS da hidratação:
 * o crawler, que não hidrata, via os quatro links. Mesma classe do achado P1-2,
 * pela via do cookie em vez da via do literal.
 */

function set(cities: Record<string, number>, primarySlug: string | null) {
  return {
    cities,
    total: Object.keys(cities).length,
    existsMinAds: 1,
    indexMinAds: 3,
    primaryCity: primarySlug
      ? { slug: primarySlug, uf: "SP", activeAds: cities[primarySlug] ?? 0 }
      : null,
  };
}

const ALTANEIRA: CityRef = {
  slug: "altaneira-ce",
  name: "Altaneira",
  state: "CE",
  label: "Altaneira (CE)",
};
const BRAGANCA: CityRef = {
  slug: "braganca-paulista-sp",
  name: "Bragança Paulista",
  state: "SP",
  label: "Bragança Paulista (SP)",
};

beforeEach(() => {
  mocks.fetchPublicCitySet.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveCookieOrPrimaryCity", () => {
  it("cookie de cidade PÚBLICA é respeitado", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(
      set({ "atibaia-sp": 3, "braganca-paulista-sp": 1 }, "atibaia-sp")
    );

    const city = await resolveCookieOrPrimaryCity(BRAGANCA);
    expect(city?.slug).toBe("braganca-paulista-sp");
  });

  it("cidade abaixo do limiar de INDEXAÇÃO ainda é cidade — existe, logo vale", async () => {
    // Bragança tem 1 anúncio: existe (200) mas não indexa. O cookie continua
    // válido — o gate é de EXISTÊNCIA, não de indexação.
    mocks.fetchPublicCitySet.mockResolvedValue(
      set({ "atibaia-sp": 3, "braganca-paulista-sp": 1 }, "atibaia-sp")
    );

    expect((await resolveCookieOrPrimaryCity(BRAGANCA))?.slug).toBe("braganca-paulista-sp");
  });

  it("cookie de cidade MORTA é descartado e vira a primária", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({ "atibaia-sp": 3 }, "atibaia-sp"));

    const city = await resolveCookieOrPrimaryCity(ALTANEIRA);
    expect(city?.slug).toBe("atibaia-sp");
    expect(city?.slug).not.toBe("altaneira-ce");
  });

  it("cookie morto SEM cidade primária vira `null` — não inventa substituto", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({}, null));

    expect(await resolveCookieOrPrimaryCity(ALTANEIRA)).toBeNull();
  });

  it("sem cookie usa a primária", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({ "atibaia-sp": 3 }, "atibaia-sp"));

    expect((await resolveCookieOrPrimaryCity(null))?.slug).toBe("atibaia-sp");
  });

  it("conjunto VAZIO e sem cookie → null", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({}, null));

    expect(await resolveCookieOrPrimaryCity(null)).toBeNull();
  });

  it("backend fora MANTÉM o cookie — fail-open, 'não sei' não descarta preferência", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(null);

    // Mesma política do gate e do `usePublicCitySet`: só `false` degrada.
    expect((await resolveCookieOrPrimaryCity(BRAGANCA))?.slug).toBe("braganca-paulista-sp");
    expect(await resolveCookieOrPrimaryCity(null)).toBeNull();
  });
});

describe("resolvePublicDefaultCity", () => {
  it("devolve a primária como CityRef completo", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({ "atibaia-sp": 27 }, "atibaia-sp"));

    expect(await resolvePublicDefaultCity()).toEqual({
      slug: "atibaia-sp",
      name: "Atibaia",
      state: "SP",
      label: "Atibaia (SP)",
    });
  });

  it("sem cidade pública → null", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(set({}, null));
    expect(await resolvePublicDefaultCity()).toBeNull();
  });

  it("backend fora → null (não inventa cidade)", async () => {
    mocks.fetchPublicCitySet.mockResolvedValue(null);
    expect(await resolvePublicDefaultCity()).toBeNull();
  });
});
