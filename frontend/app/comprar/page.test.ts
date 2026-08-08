import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/comprar` — VITRINE NACIONAL, não mais redirector.
 *
 * A versão anterior desta suíte travava o comportamento oposto: "nunca
 * renderiza in-place", redirect por cookie e, sem cookie, estado default. Era
 * o defeito, não o contrato:
 *
 *   - a MESMA URL devolvia destino diferente por visitante (cookie), e um
 *     redirect não-determinístico não é canonicalizável;
 *   - `redirect()` em Server Component do Next 14.2 pode comitar 200 com meta
 *     refresh — o crawler vê página 200 sem canonical própria e herda a da home;
 *   - sem território, caía num estado fixo.
 *
 * Agora: 200, canonical autorreferente, conteúdo derivado do inventário ATIVO.
 * As versões parametrizadas legadas (`?city_slug=`, `?state=`) redirecionam com
 * 308 real no middleware — contrato coberto em
 * `lib/middleware/canonical-redirects.test.ts`.
 */

const fetchPublicCitySetMock = vi.fn();

vi.mock("@/lib/city/public-city-set", () => ({
  fetchPublicCitySet: () => fetchPublicCitySetMock(),
}));

beforeEach(() => {
  fetchPublicCitySetMock.mockReset();
  fetchPublicCitySetMock.mockResolvedValue({
    cities: { "atibaia-sp": 19, "braganca-paulista-sp": 7, "curitiba-pr": 3 },
    total: 3,
    existsMinAds: 1,
    indexMinAds: 3,
  });
});

afterEach(() => {
  vi.resetModules();
});

async function importMetadata() {
  return (await import("./page")).generateMetadata;
}

describe("/comprar — metadata de destino final", () => {
  it("é indexável e autocanônica", async () => {
    const generateMetadata = await importMetadata();
    const md = await generateMetadata();

    expect(md.alternates?.canonical).toBe("/comprar");
    expect(md.robots).toMatchObject({ index: true, follow: true });
  });

  it("tem title e description próprios (não herda da home)", async () => {
    const generateMetadata = await importMetadata();
    const md = await generateMetadata();

    expect(typeof md.title).toBe("string");
    expect(String(md.title).length).toBeGreaterThan(10);
    expect(typeof md.description).toBe("string");
    expect(String(md.description).length).toBeGreaterThan(30);
  });

  it("não canonicaliza para nenhuma cidade", async () => {
    const generateMetadata = await importMetadata();
    const canonical = String((await generateMetadata()).alternates?.canonical ?? "");

    expect(canonical).not.toContain("/carros-em/");
    expect(canonical).not.toContain("atibaia");
    expect(canonical).not.toContain("city_slug");
  });
});

describe("/comprar — a página não redireciona", () => {
  it("renderiza (não lança NEXT_REDIRECT) sem território na URL", async () => {
    const ComprarNacionalPage = (await import("./page")).default;
    await expect(ComprarNacionalPage()).resolves.toBeTruthy();
  });

  it("renderiza mesmo com o backend indisponível", async () => {
    fetchPublicCitySetMock.mockResolvedValue(null);
    const ComprarNacionalPage = (await import("./page")).default;
    await expect(ComprarNacionalPage()).resolves.toBeTruthy();
  });
});
