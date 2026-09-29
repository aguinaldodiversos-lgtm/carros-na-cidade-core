import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as backend from "../../src/read-models/cities/city-thresholds.js";
import * as frontend from "../../frontend/lib/seo/sitemap-min-ads.ts";

/**
 * Guarda de sincronia dos limiares territoriais entre backend e frontend.
 *
 * Os dois processos leem as MESMAS variáveis de ambiente e precisam chegar ao
 * MESMO número. Se divergirem, uma cidade pode entrar no sitemap (decidido no
 * backend) e sair `noindex` no robots (decidido no frontend) — a incoerência
 * "index diz sim, sitemap diz não" que o limiar único existia para evitar,
 * agora dividida por processo em vez de por rota.
 *
 * Este teste nasceu de um defeito real: ao renomear `SITEMAP_MIN_ADS` para
 * `CITY_INDEX_MIN_ADS`, só o backend foi atualizado. Com `CITY_INDEX_MIN_ADS=5`
 * no Render, o backend usaria 5 e o frontend continuaria em 3.
 */

const ENV_KEYS = ["CITY_EXISTS_MIN_ADS", "CITY_INDEX_MIN_ADS", "SITEMAP_MIN_ADS"];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Permutações que cobrem a precedência inteira, incluindo valores inválidos. */
const CENARIOS = [
  { nome: "nenhuma env setada", env: {} },
  { nome: "só o nome antigo", env: { SITEMAP_MIN_ADS: "5" } },
  { nome: "só o nome novo", env: { CITY_INDEX_MIN_ADS: "7" } },
  { nome: "ambos — o novo vence", env: { CITY_INDEX_MIN_ADS: "7", SITEMAP_MIN_ADS: "5" } },
  { nome: "novo vazio cai no antigo", env: { CITY_INDEX_MIN_ADS: "", SITEMAP_MIN_ADS: "4" } },
  { nome: "novo inválido cai no default", env: { CITY_INDEX_MIN_ADS: "abc" } },
  { nome: "zero é inválido", env: { CITY_INDEX_MIN_ADS: "0", SITEMAP_MIN_ADS: "0" } },
  { nome: "negativo é inválido", env: { CITY_INDEX_MIN_ADS: "-2" } },
  { nome: "existência customizada", env: { CITY_EXISTS_MIN_ADS: "2" } },
  { nome: "existência inválida", env: { CITY_EXISTS_MIN_ADS: "0" } },
];

describe("limiares territoriais — sincronia backend ↔ frontend", () => {
  for (const { nome, env } of CENARIOS) {
    it(`indexação bate: ${nome}`, () => {
      Object.assign(process.env, env);
      expect(frontend.getCityIndexMinAds()).toBe(backend.getCityIndexMinAds());
    });

    it(`existência bate: ${nome}`, () => {
      Object.assign(process.env, env);
      expect(frontend.getCityExistsMinAds()).toBe(backend.getCityExistsMinAds());
    });
  }

  it("defaults idênticos: existir 1, indexar 3", () => {
    expect(backend.getCityExistsMinAds()).toBe(1);
    expect(frontend.getCityExistsMinAds()).toBe(1);
    expect(backend.getCityIndexMinAds()).toBe(3);
    expect(frontend.getCityIndexMinAds()).toBe(3);
  });

  it("existir nunca é maior que indexar nos defaults", () => {
    // Se um dia inverterem, cidade poderia indexar sem existir — absurdo que
    // vale travar aqui em vez de descobrir em produção.
    expect(backend.getCityExistsMinAds()).toBeLessThanOrEqual(backend.getCityIndexMinAds());
  });

  it("tabela de limiares por superfície é IDÊNTICA nos dois lados, em todo cenário de env", () => {
    for (const { env } of CENARIOS) {
      for (const k of ENV_KEYS) delete process.env[k];
      Object.assign(process.env, env);
      expect(frontend.getSeoInventoryThresholds()).toEqual(backend.getSeoInventoryThresholds());
      for (const surface of Object.values(backend.SEO_SURFACE)) {
        expect(frontend.getSeoThreshold(surface)).toBe(backend.getSeoThreshold(surface));
      }
    }
  });

  it("as superfícies declaradas batem (nenhuma só de um lado)", () => {
    expect(Object.keys(frontend.getSeoInventoryThresholds()).sort()).toEqual(
      Object.values(backend.SEO_SURFACE).sort()
    );
  });

  it("taxonomia de modelo → superfície: mesmo mapeamento nos dois lados", () => {
    for (const taxonomy of ["commercial", "none", "fipe", undefined, null, "", "outra"]) {
      expect(frontend.seoSurfaceForModelTaxonomy(taxonomy)).toBe(
        backend.seoSurfaceForModelTaxonomy(taxonomy)
      );
    }
  });
});

describe("política SEO por superfície — valores com as envs padrão", () => {
  const S = backend.SEO_SURFACE;

  it("cidade=3, marca=3, modelo comercial=1, URL FIPE legada=3, categorias=4 (backend e frontend)", () => {
    const esperado = {
      [S.CITY]: 3,
      [S.BRAND]: 3,
      [S.MODEL]: 1,
      [S.MODEL_FIPE_LEGACY]: 3,
      [S.BODY_TYPE]: 4,
      [S.TRANSMISSION]: 4,
      [S.PRICE_RANGE]: 4,
    };
    expect(backend.getSeoInventoryThresholds()).toEqual(esperado);
    expect(frontend.getSeoInventoryThresholds()).toEqual(esperado);
    expect(backend.getSeoThreshold(S.MODEL)).toBe(1);
    expect(frontend.getSeoThreshold("model")).toBe(1);
  });

  it("o limiar global de indexação continua 3", () => {
    expect(backend.__testing.DEFAULT_INDEX_MIN_ADS).toBe(3);
  });

  it.each([
    // F/G/H — cidade
    [S.CITY, 1, false],
    [S.CITY, 2, false],
    [S.CITY, 3, true],
    // I/J — marca
    [S.BRAND, 1, false],
    [S.BRAND, 2, false],
    [S.BRAND, 3, true],
    // modelo comercial: âncora de 1; zero nunca
    [S.MODEL, 0, false],
    [S.MODEL, 1, true],
    // URL FIPE legada: preservada em base
    [S.MODEL_FIPE_LEGACY, 1, false],
    [S.MODEL_FIPE_LEGACY, 2, false],
    [S.MODEL_FIPE_LEGACY, 3, true],
    // K — categorias transversais: base + 1
    [S.BODY_TYPE, 3, false],
    [S.BODY_TYPE, 4, true],
    [S.TRANSMISSION, 3, false],
    [S.TRANSMISSION, 4, true],
    [S.PRICE_RANGE, 3, false],
    [S.PRICE_RANGE, 4, true],
  ])("%s com %i anúncio(s) → qualifica=%s (backend = frontend)", (surface, count, ok) => {
    expect(backend.qualifiesForSeoSurface(surface, count)).toBe(ok);
    expect(frontend.qualifiesForSeoSurface(surface, count)).toBe(ok);
  });

  it("modelo comercial NÃO acompanha a env de cidade; o resto acompanha", () => {
    process.env.CITY_INDEX_MIN_ADS = "5";
    for (const side of [backend, frontend]) {
      expect(side.getSeoThreshold("city")).toBe(5);
      expect(side.getSeoThreshold("brand")).toBe(5);
      expect(side.getSeoThreshold("modelFipeLegacy")).toBe(5);
      expect(side.getSeoThreshold("bodyType")).toBe(6);
      expect(side.getSeoThreshold("model")).toBe(1);
    }
  });

  it("taxonomia → superfície", () => {
    expect(backend.seoSurfaceForModelTaxonomy("commercial")).toBe(S.MODEL);
    expect(backend.seoSurfaceForModelTaxonomy("none")).toBe(S.MODEL);
    expect(backend.seoSurfaceForModelTaxonomy("fipe")).toBe(S.MODEL_FIPE_LEGACY);
    expect(backend.seoSurfaceForModelTaxonomy(undefined)).toBe(S.MODEL_FIPE_LEGACY);
  });
});

describe("limiares territoriais — alias legado", () => {
  it("o alias legado do frontend ainda devolve o limiar de indexação", () => {
    process.env.CITY_INDEX_MIN_ADS = "6";
    expect(frontend.getSitemapMinAds()).toBe(6);
    expect(frontend.getSitemapMinAds()).toBe(backend.getCityIndexMinAds());
  });
});
