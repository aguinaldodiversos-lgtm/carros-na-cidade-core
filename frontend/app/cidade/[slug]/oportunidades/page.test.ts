import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Comportamento esperado: /cidade/[slug]/oportunidades é apenas um
 * redirect 308 (permanente) para /cidade/[slug]/abaixo-da-fipe.
 *
 * Histórico do bug: ambas rotas exibiam o mesmo catálogo (anúncios
 * `below_fipe=true`), com mesmos cards e canonical idêntico. A rodada
 * de simplificação fundiu as duas: /abaixo-da-fipe é a rota canônica
 * transacional; /oportunidades preserva tráfego via 308.
 */

const permanentRedirectMock = vi.fn((path: string) => {
  // next/navigation.permanentRedirect lança internamente — espelhamos.
  const error = new Error(`NEXT_REDIRECT:${path}`);
  (error as { digest?: string }).digest = `NEXT_REDIRECT;${path};replace;permanent`;
  throw error;
});

vi.mock("next/navigation", () => ({
  permanentRedirect: permanentRedirectMock,
}));

beforeEach(() => {
  permanentRedirectMock.mockClear();
});

afterEach(() => {
  vi.resetModules();
});

async function importPage() {
  return (await import("./page")).default;
}

describe("/cidade/[slug]/oportunidades — redirect 308 para /abaixo-da-fipe", () => {
  it("redireciona para /cidade/[slug]/abaixo-da-fipe sem searchParams", async () => {
    const Page = await importPage();
    expect(() => Page({ params: { slug: "sao-paulo-sp" } })).toThrow(/NEXT_REDIRECT/);
    expect(permanentRedirectMock).toHaveBeenCalledTimes(1);
    expect(permanentRedirectMock.mock.calls[0][0]).toBe(
      "/cidade/sao-paulo-sp/abaixo-da-fipe"
    );
  });

  it("encoda slugs com caracteres especiais", async () => {
    const Page = await importPage();
    expect(() => Page({ params: { slug: "são-paulo-sp" } })).toThrow(/NEXT_REDIRECT/);
    expect(permanentRedirectMock.mock.calls[0][0]).toBe(
      "/cidade/s%C3%A3o-paulo-sp/abaixo-da-fipe"
    );
  });

  it("preserva sort/brand/model nos searchParams (filtros não-territoriais)", async () => {
    const Page = await importPage();
    expect(() =>
      Page({
        params: { slug: "atibaia-sp" },
        searchParams: { sort: "price_asc", brand: "Toyota", model: "Corolla" },
      })
    ).toThrow(/NEXT_REDIRECT/);
    const target = permanentRedirectMock.mock.calls[0][0] as string;
    expect(target).toMatch(/^\/cidade\/atibaia-sp\/abaixo-da-fipe\?/);
    expect(target).toContain("sort=price_asc");
    expect(target).toContain("brand=Toyota");
    expect(target).toContain("model=Corolla");
  });

  it("descarta query params não-listados (defesa contra utm tracking sujo)", async () => {
    const Page = await importPage();
    expect(() =>
      Page({
        params: { slug: "atibaia-sp" },
        searchParams: {
          sort: "recent",
          utm_source: "fb",
          utm_campaign: "abc",
          fbclid: "AAA",
          random_key: "x",
        },
      })
    ).toThrow(/NEXT_REDIRECT/);
    const target = permanentRedirectMock.mock.calls[0][0] as string;
    expect(target).toContain("sort=recent");
    expect(target).not.toContain("utm_source");
    expect(target).not.toContain("fbclid");
    expect(target).not.toContain("random_key");
  });

  it("ignora valores de array (pega só o primeiro)", async () => {
    const Page = await importPage();
    expect(() =>
      Page({
        params: { slug: "atibaia-sp" },
        searchParams: { sort: ["price_asc", "recent"] },
      })
    ).toThrow(/NEXT_REDIRECT/);
    const target = permanentRedirectMock.mock.calls[0][0] as string;
    expect(target).toContain("sort=price_asc");
  });

  it("não emite query string quando nenhum param seguro foi passado", async () => {
    const Page = await importPage();
    expect(() =>
      Page({
        params: { slug: "atibaia-sp" },
        searchParams: { utm_source: "fb" },
      })
    ).toThrow(/NEXT_REDIRECT/);
    expect(permanentRedirectMock.mock.calls[0][0]).toBe(
      "/cidade/atibaia-sp/abaixo-da-fipe"
    );
  });
});
