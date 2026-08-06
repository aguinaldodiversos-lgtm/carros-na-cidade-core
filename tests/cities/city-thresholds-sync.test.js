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

  it("o alias legado do frontend ainda devolve o limiar de indexação", () => {
    process.env.CITY_INDEX_MIN_ADS = "6";
    expect(frontend.getSitemapMinAds()).toBe(6);
    expect(frontend.getSitemapMinAds()).toBe(backend.getCityIndexMinAds());
  });
});
