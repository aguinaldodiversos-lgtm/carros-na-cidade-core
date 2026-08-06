import { describe, it, expect, vi } from "vitest";
import {
  decideCityExistenceAction,
  extractCityScopedMatch,
  fetchPublicCitySet,
  isCityLikeSlug,
  type CitySetResult,
} from "./city-existence-gate";

/**
 * Invariante: "uma cidade só existe a partir do momento em que um anunciante
 * publica um anúncio nela."
 *
 * O teste central é o bloco "município real vazio ≡ município inventado": se
 * houver QUALQUER diferença entre os dois, sobrou lista em algum lugar.
 */

/** Conjunto derivado de anúncios: só Atibaia (3) e Bragança (1) têm estoque. */
const SET: CitySetResult = {
  kind: "ok",
  set: {
    cities: { "atibaia-sp": 3, "braganca-paulista-sp": 1 },
    ufs: { sp: 4 },
    total: 2,
    existsMinAds: 1,
    indexMinAds: 3,
  },
};

/** Todas as famílias de rota com escopo de cidade. */
const FAMILIAS = [
  ["comprar-cidade", (c: string) => `/comprar/cidade/${c}`],
  ["carros-em", (c: string) => `/carros-em/${c}`],
  ["carros-baratos-em", (c: string) => `/carros-baratos-em/${c}`],
  ["carros-automaticos-em", (c: string) => `/carros-automaticos-em/${c}`],
  ["tabela-fipe", (c: string) => `/tabela-fipe/${c}`],
  ["simulador-financiamento", (c: string) => `/simulador-financiamento/${c}`],
  ["cidade", (c: string) => `/cidade/${c}`],
  ["blog", (c: string) => `/blog/${c}`],
] as const;

function act(pathname: string, set: CitySetResult = SET) {
  const match = extractCityScopedMatch(pathname);
  if (!match) return { kind: "no-match" as const };
  return decideCityExistenceAction(match, set);
}

describe("teste central — município REAL vazio ≡ município INVENTADO", () => {
  // Altaneira-CE existe no IBGE e tem zero anúncios. `cidade-inventada-sp` não
  // existe em lugar nenhum. Sob o invariante, os dois são a MESMA coisa: não
  // há cidade. Qualquer divergência aqui significa que sobrou catálogo.
  for (const [familia, build] of FAMILIAS) {
    it(`${familia}: real-vazio e inventado dão o mesmo veredito`, () => {
      const real = act(build("altaneira-ce"));
      const inventada = act(build("cidade-inventada-sp"));

      expect(real).toEqual({ kind: "block-not-found", citySlug: "altaneira-ce" });
      expect(inventada).toEqual({ kind: "block-not-found", citySlug: "cidade-inventada-sp" });
      expect(real.kind).toBe(inventada.kind);
    });
  }
});

describe("cidade COM anúncio ativo passa em todas as variantes", () => {
  for (const [familia, build] of FAMILIAS) {
    it(`${familia}: atibaia-sp passa`, () => {
      expect(act(build("atibaia-sp"))).toEqual({
        kind: "pass-exists",
        citySlug: "atibaia-sp",
        activeAds: 3,
      });
    });
  }

  it("1 anúncio já faz a cidade existir (limiar de existência é 1, não 3)", () => {
    // Bragança tem 1 anúncio: existe (200), mas ficará noindex — indexação é
    // outro eixo, decidido no generateMetadata de cada rota.
    expect(act("/carros-em/braganca-paulista-sp")).toEqual({
      kind: "pass-exists",
      citySlug: "braganca-paulista-sp",
      activeAds: 1,
    });
  });
});

describe("sub-rotas herdam a decisão da cidade", () => {
  const subrotas = [
    "/cidade/altaneira-ce/marca/fiat",
    "/cidade/altaneira-ce/marca/fiat/modelo/uno",
    "/cidade/altaneira-ce/abaixo-da-fipe",
    "/cidade/altaneira-ce/oportunidades",
    "/blog/altaneira-ce/categoria/dicas",
    "/blog/altaneira-ce/algum-post",
    "/comprar/cidade/altaneira-ce/qualquer-coisa",
  ];

  for (const path of subrotas) {
    it(`bloqueia ${path}`, () => {
      expect(act(path).kind).toBe("block-not-found");
    });
  }

  it("sub-rota de cidade que existe passa", () => {
    expect(act("/cidade/atibaia-sp/marca/fiat").kind).toBe("pass-exists");
  });
});

describe("/blog é DUAL — post do CMS não pode levar 404", () => {
  it("slug sem forma de cidade não é tratado como cidade", () => {
    expect(extractCityScopedMatch("/blog/melhores-suvs-2026")).toBeNull();
    expect(extractCityScopedMatch("/blog/como-financiar-carro-usado")).toBeNull();
  });

  it("slug com forma de cidade é tratado como cidade", () => {
    expect(extractCityScopedMatch("/blog/altaneira-ce")).toEqual({
      family: "blog",
      citySlug: "altaneira-ce",
    });
  });

  it("isCityLikeSlug exige terminação -<2 letras>", () => {
    expect(isCityLikeSlug("atibaia-sp")).toBe(true);
    expect(isCityLikeSlug("sao-jose-dos-campos-sp")).toBe(true);
    expect(isCityLikeSlug("melhores-suvs-2026")).toBe(false);
    expect(isCityLikeSlug("atibaia")).toBe(false);
    expect(isCityLikeSlug("")).toBe(false);
  });
});

describe("rotas fora do escopo de cidade não são tocadas", () => {
  const fora = [
    "/",
    "/comprar",
    "/veiculo/honda-civic-2020-42",
    "/anunciar/novo",
    "/painel/anuncios",
    "/lojas/minha-loja-1",
    "/blog",
    "/carros-usados/sp",
  ];

  for (const path of fora) {
    it(`ignora ${path}`, () => {
      expect(extractCityScopedMatch(path)).toBeNull();
    });
  }
});

describe("normalização do slug", () => {
  it("maiúsculas casam com o conjunto (ALTANEIRA-CE ≡ altaneira-ce)", () => {
    expect(extractCityScopedMatch("/tabela-fipe/ALTANEIRA-CE")).toEqual({
      family: "tabela-fipe",
      citySlug: "altaneira-ce",
    });
    expect(act("/tabela-fipe/ATIBAIA-SP").kind).toBe("pass-exists");
  });

  it("percent-encoding é decodificado antes da comparação", () => {
    expect(extractCityScopedMatch("/carros-em/atibaia%2Dsp")?.citySlug).toBe("atibaia-sp");
  });
});

describe("fail-open — indisponibilidade NUNCA vira 404", () => {
  const motivos = [
    "missing-backend-api-url",
    "missing-internal-api-token",
    "backend-401",
    "backend-5xx",
    "backend-timeout",
    "bad-payload",
    "fetch-error",
  ] as const;

  for (const reason of motivos) {
    it(`${reason} → passa (não bloqueia)`, () => {
      const action = act("/carros-em/altaneira-ce", { kind: "unavailable", reason });
      expect(action).toEqual({ kind: "pass-unavailable", reason });
    });
  }

  it("backend fora do ar não derruba nem cidade que existe", () => {
    const action = act("/carros-em/atibaia-sp", {
      kind: "unavailable",
      reason: "backend-timeout",
    });
    expect(action.kind).toBe("pass-unavailable");
  });
});

describe("fetchPublicCitySet", () => {
  const base = { apiBase: "https://api.test", token: "tok" };

  it("payload malformado vira unavailable, NUNCA conjunto vazio", async () => {
    // Conjunto vazio significaria "nenhuma cidade existe" e o gate 404aria o
    // site inteiro. Mesma lição do sitemap que cacheou [] como sucesso.
    for (const body of [{ data: { cities: null } }, { data: { cities: [] } }, {}, null]) {
      const res = await fetchPublicCitySet({
        ...base,
        fetchImpl: vi.fn(async () => ({ status: 200, json: async () => body })) as never,
      });
      expect(res.kind, JSON.stringify(body)).toBe("unavailable");
      if (res.kind === "unavailable") expect(res.reason).toBe("bad-payload");
    }
  });

  it("conjunto legitimamente vazio (nenhum anúncio no site) é aceito", async () => {
    // `cities: {}` é diferente de payload quebrado: é um site sem estoque.
    const res = await fetchPublicCitySet({
      ...base,
      fetchImpl: vi.fn(async () => ({
        status: 200,
        json: async () => ({ data: { cities: {}, total: 0, existsMinAds: 1, indexMinAds: 3 } }),
      })) as never,
    });
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.set.total).toBe(0);
  });

  it("sem env de backend não chama a rede", async () => {
    const fetchImpl = vi.fn();
    const res = await fetchPublicCitySet({ apiBase: "", token: "", fetchImpl: fetchImpl as never });
    expect(res).toEqual({ kind: "unavailable", reason: "missing-backend-api-url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("401/403/5xx viram unavailable com motivo próprio", async () => {
    for (const [status, reason] of [
      [401, "backend-401"],
      [403, "backend-403"],
      [500, "backend-5xx"],
    ] as const) {
      const res = await fetchPublicCitySet({
        ...base,
        fetchImpl: vi.fn(async () => ({ status, json: async () => ({}) })) as never,
      });
      expect(res.kind).toBe("unavailable");
      if (res.kind === "unavailable") expect(res.reason).toBe(reason);
    }
  });

  it("usa o data cache do Edge com tag própria", async () => {
    // Params declarados para o `vi.fn` não inferir `calls: [][]` — sem isso a
    // leitura de `calls[0][1]` não compila.
    type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => ({
      status: 200,
      json: async () => ({ data: { cities: { "atibaia-sp": 3 } } }),
    }));
    await fetchPublicCitySet({ ...base, fetchImpl: fetchImpl as never });

    const init = fetchImpl.mock.calls[0][1] as RequestInit & {
      next?: { revalidate?: number; tags?: string[] };
    };
    expect(init.next?.revalidate).toBe(60);
    expect(init.next?.tags).toContain("public-city-set");
  });
});

describe("estado derivado — a cidade nasce e morre sozinha", () => {
  it("cidade ganha o primeiro anúncio → passa a existir", () => {
    const antes = act("/carros-em/coribe-ba");
    expect(antes.kind).toBe("block-not-found");

    const depois = act("/carros-em/coribe-ba", {
      kind: "ok",
      set: {
        ...(SET.kind === "ok" ? SET.set : ({} as never)),
        cities: { "coribe-ba": 1 },
        total: 1,
      },
    } as CitySetResult);
    expect(depois.kind).toBe("pass-exists");
  });

  it("cidade perde o último anúncio → passa a 404", () => {
    const depois = act("/carros-em/atibaia-sp", {
      kind: "ok",
      set: { cities: {}, ufs: {}, total: 0, existsMinAds: 1, indexMinAds: 3 },
    });
    expect(depois.kind).toBe("block-not-found");
  });
});
