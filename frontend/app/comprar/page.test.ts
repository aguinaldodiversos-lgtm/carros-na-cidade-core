import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Comportamento da rota /comprar (App Router server component).
 *
 * Política atual (substitui a "rodada de credibilidade", que renderizava
 * catálogo nacional aqui): /comprar é router territorial puro.
 *
 *   - URL com city_slug → redirect para /comprar/cidade/[slug]
 *   - URL com state    → redirect para /comprar/estado/[uf]
 *   - SEM contexto     → resolve UF via cookie/default e redireciona para
 *                        /comprar/estado/[uf]. Nunca renderiza in-place.
 *
 * Estes testes mockam `redirect` e `cookies` para exercitar apenas o
 * roteamento da page.tsx.
 */

const redirectMock = vi.fn((path: string) => {
  // next/navigation.redirect lança internamente — espelhamos para
  // assegurar que o caller pare de executar no fluxo de redirect.
  const error = new Error(`NEXT_REDIRECT:${path}`);
  (error as { digest?: string }).digest = `NEXT_REDIRECT;${path}`;
  throw error;
});

const cookiesMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
}));

function setCookie(value: string | undefined) {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === "cnc_city" && value ? { value } : undefined),
  });
}

beforeEach(() => {
  redirectMock.mockClear();
  cookiesMock.mockClear();
  setCookie(undefined);
});

afterEach(() => {
  vi.resetModules();
});

async function importPage() {
  return (await import("./page")).default;
}

describe("/comprar — sem território explícito", () => {
  it("redireciona para /comprar/estado/sp (default) quando searchParams está vazio e sem cookie", async () => {
    const ComprarEntryPage = await importPage();
    await expect(ComprarEntryPage({ searchParams: {} })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledTimes(1);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/sp(?:\?|$)/);
    expect(target).not.toMatch(/[?&]state=/);
    expect(target).not.toMatch(/[?&]city_slug=/);
  });

  it("usa o estado do cookie do usuário quando presente", async () => {
    setCookie(
      encodeURIComponent(
        JSON.stringify({ slug: "belo-horizonte-mg", name: "Belo Horizonte", state: "MG" })
      )
    );
    const ComprarEntryPage = await importPage();
    await expect(ComprarEntryPage({ searchParams: {} })).rejects.toThrow(/NEXT_REDIRECT/);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/mg(?:\?|$)/);
  });

  it("infere o estado pelo sufixo do slug se o cookie não trouxer state", async () => {
    setCookie(
      encodeURIComponent(JSON.stringify({ slug: "curitiba-pr", name: "Curitiba" }))
    );
    const ComprarEntryPage = await importPage();
    // Quando state não está no cookie, parseCityCookieValue assume "SP" como
    // fallback. Não inferimos UF pelo slug nesse caso — comportamento
    // documentado em parse-city-cookie-server.ts:16.
    await expect(ComprarEntryPage({ searchParams: {} })).rejects.toThrow(/NEXT_REDIRECT/);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/sp(?:\?|$)/);
  });

  it("preserva filtros não-territoriais no redirect default", async () => {
    const ComprarEntryPage = await importPage();
    await expect(
      ComprarEntryPage({ searchParams: { brand: "Honda", model: "Civic", max_price: "80000" } })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/sp\?/);
    expect(target).toContain("brand=Honda");
    expect(target).toContain("model=Civic");
    expect(target).toContain("max_price=80000");
  });
});

describe("/comprar — com território explícito (redirect canonical)", () => {
  it("redireciona para /comprar/cidade/[slug] quando city_slug é válido", async () => {
    const ComprarEntryPage = await importPage();

    await expect(
      ComprarEntryPage({ searchParams: { city_slug: "atibaia-sp" } })
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirectMock).toHaveBeenCalledTimes(1);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/cidade\/atibaia-sp(?:\?|$)/);
    // city_slug NÃO pode aparecer na query string da rota canônica de cidade.
    expect(target).not.toMatch(/[?&]city_slug=/);
  });

  it("redireciona para /comprar/estado/[uf] quando state é válido", async () => {
    const ComprarEntryPage = await importPage();
    await expect(ComprarEntryPage({ searchParams: { state: "MG" } })).rejects.toThrow(
      /NEXT_REDIRECT/
    );
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/mg(?:\?|$)/);
    expect(target).not.toMatch(/[?&]state=/);
  });

  it("preserva filtros não-territoriais ao redirecionar para cidade", async () => {
    const ComprarEntryPage = await importPage();
    await expect(
      ComprarEntryPage({
        searchParams: { city_slug: "atibaia-sp", brand: "Toyota", sort: "price_asc" },
      })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toContain("/comprar/cidade/atibaia-sp");
    expect(target).toContain("brand=Toyota");
    expect(target).toContain("sort=price_asc");
  });

  it("city_slug inválido (sem UF) cai no redirect default do estado", async () => {
    const ComprarEntryPage = await importPage();
    await expect(
      ComprarEntryPage({ searchParams: { city_slug: "cidade-fake" } })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/sp(?:\?|$)/);
  });

  it("state inválido cai no redirect default do estado", async () => {
    const ComprarEntryPage = await importPage();
    await expect(ComprarEntryPage({ searchParams: { state: "XX" } })).rejects.toThrow(
      /NEXT_REDIRECT/
    );
    const target = redirectMock.mock.calls[0][0];
    expect(target).toMatch(/^\/comprar\/estado\/sp(?:\?|$)/);
  });
});
