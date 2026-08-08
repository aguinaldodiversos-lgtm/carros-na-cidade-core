import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  __resetCitySetSnapshot,
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

      expect(real).toMatchObject({ kind: "block-not-found", citySlug: "altaneira-ce" });
      expect(inventada).toMatchObject({ kind: "block-not-found", citySlug: "cidade-inventada-sp" });
      expect(real.kind).toBe(inventada.kind);
    });
  }
});

describe("cidade COM anúncio ativo passa em todas as variantes", () => {
  for (const [familia, build] of FAMILIAS) {
    it(`${familia}: atibaia-sp passa`, () => {
      expect(act(build("atibaia-sp"))).toMatchObject({
        kind: "pass-exists",
        citySlug: "atibaia-sp",
        activeAds: 3,
      });
    });
  }

  it("1 anúncio já faz a cidade existir (limiar de existência é 1, não 3)", () => {
    // Bragança tem 1 anúncio: existe (200), mas ficará noindex — indexação é
    // outro eixo, decidido no generateMetadata de cada rota.
    expect(act("/carros-em/braganca-paulista-sp")).toMatchObject({
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
    // Região ANCORADA numa cidade que não existe. Chegou a ficar no gate de
    // UF; produzia um H1 "Carros usados em Altaneira e região" para uma cidade
    // que dá 404 nas outras 7 rotas.
    "/carros-usados/regiao/altaneira-ce",
  ];

  for (const path of subrotas) {
    it(`bloqueia ${path}`, () => {
      expect(act(path).kind).toBe("block-not-found");
    });
  }

  it("sub-rota de cidade que existe passa", () => {
    expect(act("/cidade/atibaia-sp/marca/fiat").kind).toBe("pass-exists");
  });

  it("região ancorada em cidade que EXISTE passa", () => {
    expect(act("/carros-usados/regiao/atibaia-sp").kind).toBe("pass-exists");
  });

  it("/carros-usados/regiao/ é família de CIDADE, não de UF", () => {
    expect(extractCityScopedMatch("/carros-usados/regiao/altaneira-ce")).toEqual({
      family: "carros-usados-regiao",
      citySlug: "altaneira-ce",
    });
  });

  it("/carros-usados/[uf] NÃO é capturado pelo gate de cidade", () => {
    // As duas rotas compartilham prefixo; se o padrão de cidade engolisse a de
    // UF, `/carros-usados/sp` procuraria "sp" no conjunto de CIDADES e 404aria
    // um estado que tem estoque.
    expect(extractCityScopedMatch("/carros-usados/sp")).toBeNull();
    expect(extractCityScopedMatch("/carros-usados/ce")).toBeNull();
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

/**
 * FAIL-SAFE — substituiu o antigo bloco "fail-open" em 2026-08-07.
 *
 * A suíte anterior travava o comportamento errado: ela exigia que
 * indisponibilidade PASSASSE. Era o defeito, não o contrato — e foi por isso
 * que uma env ausente no build desligou o invariante com todos os testes
 * verdes. "Não consegui verificar" agora tem resposta própria.
 */
describe("fail-safe — indisponibilidade NUNCA vira 200", () => {
  const motivos = [
    "missing-backend-api-url",
    "backend-401",
    "backend-403",
    "backend-5xx",
    "backend-timeout",
    "bad-payload",
    "fetch-error",
  ] as const;

  for (const reason of motivos) {
    it(`${reason} → block-unavailable (503), nunca passa`, () => {
      const action = act("/carros-em/altaneira-ce", { kind: "unavailable", reason });
      expect(action).toEqual({ kind: "block-unavailable", reason });
    });
  }

  it("nem para cidade que existe: sem verificação, ninguém passa", () => {
    // O ponto: não sabemos que ela existe. O gate não pode adivinhar certo
    // por sorte — se soubesse, não estaria indisponível.
    const action = act("/carros-em/atibaia-sp", {
      kind: "unavailable",
      reason: "backend-timeout",
    });
    expect(action.kind).toBe("block-unavailable");
  });

  it("nenhum motivo de indisponibilidade produz `pass-exists`", () => {
    for (const reason of motivos) {
      for (const slug of ["atibaia-sp", "braganca-paulista-sp", "altaneira-ce", "xpto-zz"]) {
        expect(act(`/carros-em/${slug}`, { kind: "unavailable", reason }).kind).not.toBe(
          "pass-exists"
        );
      }
    }
  });

  it("indisponibilidade também não vira 404 — o status é 503, que é temporário", () => {
    // 404 diria "esta cidade não existe", afirmação que não temos como fazer.
    // Google trata 404 como remoção; 503 como "volte depois".
    expect(act("/carros-em/atibaia-sp", { kind: "unavailable", reason: "fetch-error" }).kind).toBe(
      "block-unavailable"
    );
  });
});

describe("snapshot — decisão com o último estado confirmado", () => {
  const SET = {
    cities: { "atibaia-sp": 19 },
    ufs: { sp: 19 },
    total: 1,
    existsMinAds: 1,
    indexMinAds: 3,
  };

  const stale = { kind: "stale", set: SET, reason: "backend-timeout", ageMs: 5000 } as const;

  it("cidade presente no snapshot passa, marcada como snapshot", () => {
    expect(act("/carros-em/atibaia-sp", stale)).toEqual({
      kind: "pass-exists",
      citySlug: "atibaia-sp",
      activeAds: 19,
      source: "snapshot",
    });
  });

  it("cidade AUSENTE do snapshot continua 404 — o snapshot não relaxa a regra", () => {
    expect(act("/carros-em/braganca-paulista-sp", stale)).toEqual({
      kind: "block-not-found",
      citySlug: "braganca-paulista-sp",
      source: "snapshot",
    });
  });

  it("decisão fresca é marcada como fresh", () => {
    const action = act("/carros-em/atibaia-sp", { kind: "ok", set: SET });
    expect(action).toMatchObject({ kind: "pass-exists", source: "fresh" });
  });
});

describe("fetchPublicCitySet", () => {
  const base = { apiBase: "https://api.test", token: "tok" };

  // O snapshot é estado de MÓDULO: sem reset, um caso de sucesso contamina o
  // caso de falha seguinte (a falha viraria `stale` em vez de `unavailable`).
  // Mesma disciplina do `__resetSitemapLastGoodCache`.
  beforeEach(() => {
    __resetCitySetSnapshot();
  });

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

  it("NUNCA guarda snapshot a partir de payload malformado", async () => {
    // Cachear "não sei" como estado bom é o defeito que congelou o sitemap
    // vazio por semanas em 2026-07-27. Aqui seria pior: viraria autorização.
    await fetchPublicCitySet({
      ...base,
      fetchImpl: vi.fn(async () => ({ status: 200, json: async () => ({ data: {} }) })) as never,
    });

    const depois = await fetchPublicCitySet({
      ...base,
      fetchImpl: vi.fn(async () => {
        throw new Error("backend fora");
      }) as never,
    });
    expect(depois.kind).toBe("unavailable");
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
    expect(res).toMatchObject({ kind: "unavailable", reason: "missing-backend-api-url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  /**
   * O token é bypass de rate-limit, não autorização. Verificado no backend e
   * por requisição real: `/api/public/cities/public-set` responde 200 sem token
   * e com token inválido.
   *
   * A versão anterior tinha `if (!token) return unavailable` — o gate recusava
   * uma chamada que teria funcionado. Como o Next inlina `process.env` no
   * bundle Edge em tempo de BUILD, um build sem a env desligava o invariante
   * inteiro, silenciosamente, com todos os testes verdes.
   */
  it("token AUSENTE não impede a chamada — o endpoint é público", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({ data: { cities: { "atibaia-sp": 3 }, ufs: { sp: 3 } } }),
    }));
    const res = await fetchPublicCitySet({
      apiBase: "https://api.test",
      token: "",
      fetchImpl: fetchImpl as never,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.kind).toBe("ok");
  });

  it("token INVÁLIDO não impede a chamada — quem decide é o backend", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({ data: { cities: { "atibaia-sp": 3 }, ufs: { sp: 3 } } }),
    }));
    const res = await fetchPublicCitySet({
      apiBase: "https://api.test",
      token: "token-errado",
      fetchImpl: fetchImpl as never,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.kind).toBe("ok");
  });

  it("401/403/5xx viram unavailable com motivo próprio (sem snapshot)", async () => {
    for (const [status, reason] of [
      [401, "backend-401"],
      [403, "backend-403"],
      [500, "backend-5xx"],
    ] as const) {
      __resetCitySetSnapshot();
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
