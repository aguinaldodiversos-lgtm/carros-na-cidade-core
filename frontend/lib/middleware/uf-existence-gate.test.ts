import { describe, it, expect } from "vitest";
import {
  decideUfExistenceAction,
  deriveUfsFromCities,
  extractUfScopedMatch,
  ufFromCitySlug,
  type CitySetResult,
} from "./city-existence-gate";

/**
 * "UF sem nenhum anúncio no estado inteiro também não existe."
 *
 * Mesmo invariante do gate de cidade, um nível acima, derivado do MESMO
 * conjunto — não de uma segunda consulta.
 */

/** SP tem 4 anúncios (3 + 1); CE e BA, nenhum. */
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

const FAMILIAS = [
  ["carros-usados-uf", (uf: string) => `/carros-usados/${uf}`],
  ["comprar-estado", (uf: string) => `/comprar/estado/${uf}`],
  ["uf-regiao", (uf: string) => `/${uf}/regiao/alguma-ancora`],
] as const;

function act(pathname: string, set: CitySetResult = SET) {
  const match = extractUfScopedMatch(pathname);
  if (!match) return { kind: "no-match" as const };
  return decideUfExistenceAction(match, set);
}

describe("UF sem nenhum anúncio → 404", () => {
  for (const [familia, build] of FAMILIAS) {
    it(`${familia}: CE (estado vazio) é bloqueado`, () => {
      expect(act(build("ce"))).toEqual({ kind: "block-not-found", uf: "ce" });
    });
  }

  it("região ancorada em cidade de estado vazio é bloqueada", () => {
    expect(act("/carros-usados/regiao/altaneira-ce")).toEqual({
      kind: "block-not-found",
      uf: "ce",
    });
  });
});

describe("UF com anúncio → passa", () => {
  for (const [familia, build] of FAMILIAS) {
    it(`${familia}: SP passa`, () => {
      expect(act(build("sp"))).toEqual({ kind: "pass-exists", uf: "sp", activeAds: 4 });
    });
  }

  it("região ancorada em cidade SEM estoque, mas de estado COM estoque, passa", () => {
    // O ponto do gate ser por UF e não pela cidade âncora: a região pode
    // conter vizinhas com estoque mesmo quando a âncora não tem.
    expect(act("/carros-usados/regiao/ipua-sp")).toEqual({
      kind: "pass-exists",
      uf: "sp",
      activeAds: 4,
    });
  });
});

describe("estado derivado", () => {
  it("UF perde o último anúncio → passa a 404", () => {
    const vazio: CitySetResult = {
      kind: "ok",
      set: { cities: {}, ufs: {}, total: 0, existsMinAds: 1, indexMinAds: 3 },
    };
    expect(act("/carros-usados/sp", vazio).kind).toBe("block-not-found");
  });

  it("UF ganha o primeiro anúncio → passa a existir", () => {
    const comCe: CitySetResult = {
      kind: "ok",
      set: {
        cities: { "altaneira-ce": 1 },
        ufs: { ce: 1 },
        total: 1,
        existsMinAds: 1,
        indexMinAds: 3,
      },
    };
    expect(act("/carros-usados/ce", comCe)).toEqual({
      kind: "pass-exists",
      uf: "ce",
      activeAds: 1,
    });
  });
});

describe("extração — não capturar o site inteiro", () => {
  it("/[uf]/regiao/ só casa com UF de 2 letras", () => {
    expect(extractUfScopedMatch("/sp/regiao/campinas")).toEqual({
      family: "uf-regiao",
      uf: "sp",
    });
    // Sem isto, o padrão de segmento na RAIZ engoliria rotas comuns.
    expect(extractUfScopedMatch("/lojas/regiao/x")).toBeNull();
    expect(extractUfScopedMatch("/painel/regiao/x")).toBeNull();
  });

  const fora = [
    "/",
    "/comprar",
    "/carros-em/atibaia-sp",
    "/veiculo/honda-civic-2020-42",
    "/carros-usados", // sem UF
    "/lojas/minha-loja-1",
    "/blog/melhores-suvs-2026",
  ];
  for (const path of fora) {
    it(`ignora ${path}`, () => {
      expect(extractUfScopedMatch(path)).toBeNull();
    });
  }

  it("normaliza caixa da UF", () => {
    expect(extractUfScopedMatch("/carros-usados/SP")?.uf).toBe("sp");
    expect(act("/carros-usados/SP").kind).toBe("pass-exists");
  });
});

describe("fail-open", () => {
  const motivos = ["backend-5xx", "backend-timeout", "bad-payload", "fetch-error"] as const;
  for (const reason of motivos) {
    it(`${reason} → passa (não bloqueia)`, () => {
      expect(act("/carros-usados/ce", { kind: "unavailable", reason })).toEqual({
        kind: "pass-unavailable",
        reason,
      });
    });
  }
});

describe("compatibilidade entre deploys", () => {
  it("payload sem `ufs` deriva do sufixo dos slugs, não vira vazio", () => {
    // Se o frontend subir antes do backend, `ufs` não vem. Derivar vazio
    // 404aria TODAS as UFs durante a janela entre os dois deploys.
    const derived = deriveUfsFromCities({ "atibaia-sp": 3, "braganca-paulista-sp": 1 });
    expect(derived).toEqual({ sp: 4 });
  });

  it("ufFromCitySlug extrai a UF do slug canônico", () => {
    expect(ufFromCitySlug("atibaia-sp")).toBe("sp");
    expect(ufFromCitySlug("sao-jose-dos-campos-sp")).toBe("sp");
    expect(ufFromCitySlug("altaneira-ce")).toBe("ce");
    expect(ufFromCitySlug("semuf")).toBe("");
    expect(ufFromCitySlug("")).toBe("");
  });
});
