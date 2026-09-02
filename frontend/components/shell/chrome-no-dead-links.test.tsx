// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CityRef } from "@/lib/city/city-types";

/**
 * O CHROME RENDERIZADO não pode conter link para cidade sem estoque.
 *
 * ── A lacuna que este arquivo fecha (SEO Fase 4.1A, §23) ─────────────────────
 * `lib/seo/internal-links-sweep.test.ts` já existia e mesmo assim os links
 * mortos passaram: ele varre CONSTRUTORES de link, não HTML renderizado. Os
 * defeitos P1-2/P1-4/P1-5 nasceram exatamente na junção — um componente
 * chamando o construtor com o argumento errado (o literal `sao-paulo-sp`).
 *
 * Aqui montamos header e rodapé de verdade e lemos os `href` do DOM.
 *
 * ── Por que não usa a internet ───────────────────────────────────────────────
 * O conjunto público é injetado por mock, e a asserção é estrutural: nenhum
 * `href` pode apontar para uma cidade FORA do conjunto. Não há fetch, não há
 * servidor, e o teste vale igual em qualquer máquina.
 */

const navMocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navMocks.pathname,
  useRouter: () => ({ push: navMocks.push, refresh: navMocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const citySetMock = vi.hoisted(() => ({ cities: new Set<string>(), status: "ready" as string }));

vi.mock("@/lib/city/use-public-city-set", () => ({
  usePublicCitySet: () => ({
    status: citySetMock.status,
    isPublicCity: (slug: string | null | undefined) => {
      if (citySetMock.status !== "ready") return undefined;
      return citySetMock.cities.has(String(slug || ""));
    },
  }),
}));

/**
 * Armazenamento local zerado: o cenário sob teste é o do CRAWLER — sem cookie e
 * sem localStorage. A cidade vem só do `initialCity` resolvido no servidor, que
 * é exatamente a via por onde o literal `sao-paulo-sp` entrava.
 */
vi.mock("@/lib/city/city-storage", () => ({
  readCityFromLocalStorage: () => null,
  readCityFromCookie: () => null,
  hasUserConfirmedCity: () => false,
  writeCityToLocalStorage: vi.fn(),
  writeCityCookie: vi.fn(),
  discardStoredCityIfAbsent: vi.fn(),
}));

// O header consulta a sessão ao montar; irrelevante para os links territoriais.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response)
);

const { CityProvider } = await import("@/lib/city/CityContext");
const { PublicFooter } = await import("@/components/shell/PublicFooter");
const { PublicHeader } = await import("@/components/shell/PublicHeader");

/** Toda rota do portal cujo primeiro segmento após o prefixo é uma cidade. */
const CITY_SCOPED_PREFIXES = [
  "carros-em",
  "carros-baratos-em",
  "carros-automaticos-em",
  "tabela-fipe",
  "simulador-financiamento",
  "blog",
  "cidade",
  "comprar/cidade",
];

const CITY_SLUG_RE = /^[a-z0-9-]+-[a-z]{2}$/;

/**
 * Slugs de cidade citados nos `href` do DOM.
 *
 * Só considera o primeiro segmento após um prefixo territorial conhecido, e só
 * quando ele TEM CARA de cidade (`nome-uf`). `/blog/ipva-2025-entenda-tudo` é
 * post, não cidade, e não entra.
 */
function citySlugsInDom(container: HTMLElement): string[] {
  const found = new Set<string>();

  for (const anchor of Array.from(container.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href") || "";
    if (!href.startsWith("/")) continue;
    const path = href.split("?")[0].split("#")[0];

    for (const prefix of CITY_SCOPED_PREFIXES) {
      if (!path.startsWith(`/${prefix}/`)) continue;
      const rest = path.slice(prefix.length + 2).split("/")[0];
      if (CITY_SLUG_RE.test(rest)) found.add(rest);
    }
  }

  return [...found];
}

function renderChrome(initialCity: CityRef | null) {
  return render(
    <CityProvider initialCity={initialCity}>
      <PublicHeader />
      <PublicFooter />
    </CityProvider>
  );
}

const ATIBAIA: CityRef = {
  slug: "atibaia-sp",
  name: "Atibaia",
  state: "SP",
  label: "Atibaia (SP)",
};
const CAMPINAS: CityRef = {
  slug: "campinas-sp",
  name: "Campinas",
  state: "SP",
  label: "Campinas (SP)",
};
/** Cidade que existia e perdeu o último anúncio — hoje responde 404. */
const ALTANEIRA: CityRef = {
  slug: "altaneira-ce",
  name: "Altaneira",
  state: "CE",
  label: "Altaneira (CE)",
};

beforeEach(() => {
  navMocks.pathname = "/";
  citySetMock.status = "ready";
  citySetMock.cities = new Set(["atibaia-sp"]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("chrome renderizado — nenhum link para cidade fora do conjunto público", () => {
  it("Googlebot (sem cookie) com Atibaia ativa: só Atibaia aparece", () => {
    const { container } = renderChrome(ATIBAIA);
    const slugs = citySlugsInDom(container);

    expect(slugs).not.toContain("sao-paulo-sp");
    for (const slug of slugs) {
      expect(citySetMock.cities.has(slug)).toBe(true);
    }
  });

  it("Googlebot com MÚLTIPLAS cidades: só a resolvida aparece, nenhuma inventada", () => {
    citySetMock.cities = new Set(["atibaia-sp", "campinas-sp"]);
    const { container } = renderChrome(CAMPINAS);
    const slugs = citySlugsInDom(container);

    expect(slugs).not.toContain("sao-paulo-sp");
    for (const slug of slugs) {
      expect(citySetMock.cities.has(slug)).toBe(true);
    }
  });

  it("conjunto público VAZIO: nenhum link de cidade é emitido", () => {
    citySetMock.cities = new Set();
    const { container } = renderChrome(null);

    expect(citySlugsInDom(container)).toEqual([]);
    expect(container.innerHTML).not.toContain("sao-paulo-sp");
  });

  it("sem cidade resolvida, o chrome ainda oferece as rotas-índice (não fica mudo)", () => {
    citySetMock.cities = new Set();
    const { container } = renderChrome(null);

    const hrefs = Array.from(container.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toContain("/tabela-fipe");
    expect(hrefs).toContain("/blog");
    expect(hrefs).toContain("/comprar");
  });

  it("usuário com cookie de cidade VÁLIDA: os links são daquela cidade", () => {
    citySetMock.cities = new Set(["atibaia-sp", "campinas-sp"]);
    const { container } = renderChrome(CAMPINAS);

    const hrefs = Array.from(container.querySelectorAll("a[href]")).map(
      (a) => a.getAttribute("href") || ""
    );
    expect(hrefs.some((h) => h.includes("campinas-sp"))).toBe(true);
  });

  it("cidade guardada que PERDEU o estoque não vira link — degrada para índice", () => {
    citySetMock.cities = new Set(["atibaia-sp"]);
    const { container } = renderChrome(ALTANEIRA);

    expect(container.innerHTML).not.toContain("altaneira-ce");
    expect(citySlugsInDom(container)).toEqual([]);
  });

  it("conjunto INDISPONÍVEL mantém o territorial (fail-open) sem inventar cidade", () => {
    citySetMock.status = "unavailable";
    const { container } = renderChrome(ATIBAIA);
    const slugs = citySlugsInDom(container);

    // Fail-open: a cidade resolvida continua valendo…
    expect(slugs).toEqual(["atibaia-sp"]);
    // …mas nada de São Paulo aparecer do nada.
    expect(container.innerHTML).not.toContain("sao-paulo-sp");
  });
});
