import { describe, it, expect } from "vitest";
import { getTerritorialRoutesForCity } from "./site-navigation";

/**
 * Cabeçalho não pode montar href para cidade que não existe.
 *
 * Caso real medido em produção (2026-08-05) com `altaneira-ce` guardado no
 * cliente: três dos quatro links principais levavam a 404.
 */

const CIDADE_VAZIA = "altaneira-ce";
const CIDADE_COM_ESTOQUE = "atibaia-sp";

/** Rotas do cabeçalho que carregam o slug no PATH — as que dão 404. */
const ROTAS_DE_PATH = ["fipe", "financing", "cidade", "regional", "blog"] as const;

describe("cidade FORA do conjunto público", () => {
  const routes = getTerritorialRoutesForCity(CIDADE_VAZIA, { isPublicCity: false });

  it("nenhum href contém o slug da cidade", () => {
    for (const href of Object.values(routes)) {
      expect(href, href).not.toContain(CIDADE_VAZIA);
    }
  });

  for (const key of ROTAS_DE_PATH) {
    it(`${key} cai na rota-índice, sem segmento de cidade`, () => {
      const href = routes[key];
      expect(href.split("?")[0].split("/").filter(Boolean).length).toBeLessThanOrEqual(1);
    });
  }

  it("os três links que quebravam apontam para índices que respondem 200", () => {
    expect(routes.fipe).toBe("/tabela-fipe");
    expect(routes.financing).toBe("/simulador-financiamento");
    expect(routes.blog).toBe("/blog");
  });

  it("comprar perde o filtro fantasma, mas segue funcional", () => {
    expect(routes.comprar).toBe("/comprar");
    expect(routes.comprarBelowFipe).toBe("/comprar?below_fipe=true");
  });
});

describe("cidade DENTRO do conjunto público", () => {
  const routes = getTerritorialRoutesForCity(CIDADE_COM_ESTOQUE, { isPublicCity: true });

  it("mantém o comportamento territorial", () => {
    expect(routes.fipe).toBe(`/tabela-fipe/${CIDADE_COM_ESTOQUE}`);
    expect(routes.financing).toBe(`/simulador-financiamento/${CIDADE_COM_ESTOQUE}`);
    expect(routes.blog).toBe(`/blog/${CIDADE_COM_ESTOQUE}`);
    expect(routes.comprar).toBe(`/comprar?city_slug=${CIDADE_COM_ESTOQUE}`);
  });
});

describe("fail-open — não saber NÃO degrada", () => {
  // `undefined` cobre "conjunto carregando" e "chamada falhou". Nos dois casos
  // o cabeçalho mantém os links territoriais: degradar por falha de rede
  // esvaziaria a navegação de todo visitante.
  const casos: Array<[string, { isPublicCity?: boolean } | undefined]> = [
    ["sem opções", undefined],
    ["objeto vazio", {}],
    ["isPublicCity undefined", { isPublicCity: undefined }],
  ];

  for (const [nome, opts] of casos) {
    it(`${nome} → mantém rotas territoriais`, () => {
      const routes = getTerritorialRoutesForCity(CIDADE_COM_ESTOQUE, opts);
      expect(routes.fipe).toBe(`/tabela-fipe/${CIDADE_COM_ESTOQUE}`);
      expect(routes.blog).toBe(`/blog/${CIDADE_COM_ESTOQUE}`);
    });
  }

  it("só `false` degrada — `undefined` não", () => {
    const desconhecido = getTerritorialRoutesForCity(CIDADE_VAZIA, { isPublicCity: undefined });
    const ausente = getTerritorialRoutesForCity(CIDADE_VAZIA, { isPublicCity: false });

    expect(desconhecido.fipe).toContain(CIDADE_VAZIA);
    expect(ausente.fipe).not.toContain(CIDADE_VAZIA);
  });
});
