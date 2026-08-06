/**
 * Fonte única do conjunto de cidades públicas.
 *
 *   "Uma cidade só existe a partir do momento em que um anunciante publica um
 *    anúncio nela."
 *
 * Protege os dois limiares (existir ≠ indexar) e a parte pura da montagem.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  buildPublicCitySet,
  citySetHas,
  citySetCount,
  ufSetHas,
  ufSetCount,
} from "../../src/read-models/cities/public-city-set.service.js";
import {
  getCityExistsMinAds,
  getCityIndexMinAds,
} from "../../src/read-models/cities/city-thresholds.js";

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

const rows = [
  { city_slug: "atibaia-sp", state: "SP", total: 19 },
  { city_slug: "braganca-paulista-sp", state: "SP", total: 2 },
  { city_slug: "jundiai-sp", state: "SP", total: 1 },
];

describe("limiares — existir e indexar são perguntas diferentes", () => {
  it("defaults: existir >= 1, indexar >= 3", () => {
    expect(getCityExistsMinAds()).toBe(1);
    expect(getCityIndexMinAds()).toBe(3);
  });

  it("CITY_INDEX_MIN_ADS tem precedência sobre o nome antigo", () => {
    process.env.SITEMAP_MIN_ADS = "5";
    process.env.CITY_INDEX_MIN_ADS = "7";
    expect(getCityIndexMinAds()).toBe(7);
  });

  it("cai em SITEMAP_MIN_ADS quando o nome novo não está setado", () => {
    // A config do Render não é versionada: renomear sem fallback perderia o
    // valor já configurado e mudaria o comportamento em silêncio.
    process.env.SITEMAP_MIN_ADS = "5";
    expect(getCityIndexMinAds()).toBe(5);
  });

  it("valor inválido cai no default, não em zero", () => {
    process.env.CITY_INDEX_MIN_ADS = "0";
    expect(getCityIndexMinAds()).toBe(3);
    process.env.CITY_EXISTS_MIN_ADS = "abc";
    expect(getCityExistsMinAds()).toBe(1);
  });
});

describe("buildPublicCitySet", () => {
  it("cidade com UM anúncio entra no conjunto", () => {
    const set = buildPublicCitySet(rows);
    expect(citySetHas(set, "jundiai-sp")).toBe(true);
    expect(citySetCount(set, "jundiai-sp")).toBe(1);
  });

  it("conta indexáveis separado de existentes", () => {
    const set = buildPublicCitySet(rows);
    expect(set.total).toBe(3); // existem
    expect(set.indexable).toBe(1); // só Atibaia tem >= 3
  });

  it("cidade sem anúncio simplesmente não aparece", () => {
    const set = buildPublicCitySet(rows);
    expect(citySetHas(set, "altaneira-ce")).toBe(false);
    expect(citySetCount(set, "altaneira-ce")).toBe(0);
  });

  it("município inventado é indistinguível de município real vazio", () => {
    const set = buildPublicCitySet(rows);
    expect(citySetHas(set, "altaneira-ce")).toBe(citySetHas(set, "cidade-inventada-sp"));
  });

  it("normaliza caixa do slug", () => {
    const set = buildPublicCitySet([{ city_slug: "ATIBAIA-SP", total: 4 }]);
    expect(citySetHas(set, "atibaia-sp")).toBe(true);
    expect(citySetHas(set, "ATIBAIA-SP")).toBe(true);
  });

  it("soma grafias que slugificam igual", () => {
    const set = buildPublicCitySet([
      { city_slug: "atibaia-sp", total: 2 },
      { city_slug: "ATIBAIA-SP", total: 2 },
    ]);
    expect(citySetCount(set, "atibaia-sp")).toBe(4);
    expect(set.indexable).toBe(1);
  });

  it("ignora linha sem slug e entrada não-array", () => {
    expect(buildPublicCitySet([{ city_slug: "", total: 9 }]).total).toBe(0);
    expect(buildPublicCitySet(null).total).toBe(0);
    expect(buildPublicCitySet(undefined).total).toBe(0);
  });

  it("respeita limiar de existência configurado", () => {
    const set = buildPublicCitySet(rows, { existsMinAds: 2 });
    expect(citySetHas(set, "jundiai-sp")).toBe(false);
    expect(citySetHas(set, "braganca-paulista-sp")).toBe(true);
  });
});

describe("agregação por UF — derivada das MESMAS cidades", () => {
  it("soma os anúncios de todas as cidades do estado", () => {
    const set = buildPublicCitySet(rows);
    // 19 + 2 + 1, todas em SP
    expect(ufSetCount(set, "sp")).toBe(22);
    expect(ufSetHas(set, "sp")).toBe(true);
  });

  it("UF sem nenhuma cidade com estoque não existe", () => {
    const set = buildPublicCitySet(rows);
    expect(ufSetHas(set, "ce")).toBe(false);
    expect(ufSetCount(set, "ce")).toBe(0);
  });

  it("usa row.state quando presente", () => {
    const set = buildPublicCitySet([{ city_slug: "atibaia-sp", state: "SP", total: 5 }]);
    expect(ufSetCount(set, "sp")).toBe(5);
  });

  it("cai no sufixo do slug quando row.state vem vazio", () => {
    const set = buildPublicCitySet([{ city_slug: "altaneira-ce", state: null, total: 2 }]);
    expect(ufSetCount(set, "ce")).toBe(2);
  });

  it("normaliza caixa da UF", () => {
    const set = buildPublicCitySet([{ city_slug: "atibaia-sp", state: "SP", total: 3 }]);
    expect(ufSetHas(set, "SP")).toBe(true);
    expect(ufSetHas(set, "sp")).toBe(true);
  });

  it("agrega estados diferentes separadamente", () => {
    const set = buildPublicCitySet([
      { city_slug: "atibaia-sp", state: "SP", total: 3 },
      { city_slug: "coribe-ba", state: "BA", total: 2 },
    ]);
    expect(ufSetCount(set, "sp")).toBe(3);
    expect(ufSetCount(set, "ba")).toBe(2);
  });

  it("entrada inválida não vira UF", () => {
    expect(ufSetCount(buildPublicCitySet(rows), "")).toBe(0);
    expect(ufSetCount(buildPublicCitySet(rows), "sao-paulo")).toBe(0);
    expect(ufSetCount(null, "sp")).toBe(0);
  });

  it("cidade abaixo do limiar de existência não conta para a UF", () => {
    // Coerência: se a cidade não existe, o anúncio dela não sustenta o estado.
    const set = buildPublicCitySet([{ city_slug: "jundiai-sp", total: 1 }], { existsMinAds: 2 });
    expect(ufSetHas(set, "sp")).toBe(false);
  });
});

describe("estado derivado", () => {
  it("primeiro anúncio faz a cidade nascer", () => {
    expect(citySetHas(buildPublicCitySet([]), "coribe-ba")).toBe(false);
    expect(
      citySetHas(buildPublicCitySet([{ city_slug: "coribe-ba", total: 1 }]), "coribe-ba")
    ).toBe(true);
  });

  it("último anúncio saindo faz a cidade morrer", () => {
    expect(
      citySetHas(buildPublicCitySet([{ city_slug: "coribe-ba", total: 1 }]), "coribe-ba")
    ).toBe(true);
    expect(citySetHas(buildPublicCitySet([]), "coribe-ba")).toBe(false);
  });

  it("site sem estoque nenhum devolve conjunto vazio, sem quebrar", () => {
    const set = buildPublicCitySet([]);
    expect(set).toEqual({ cities: {}, ufs: {}, total: 0, indexable: 0 });
  });

  it("UF perde a última cidade com estoque → deixa de existir", () => {
    const antes = buildPublicCitySet([{ city_slug: "coribe-ba", state: "BA", total: 1 }]);
    expect(ufSetHas(antes, "ba")).toBe(true);
    expect(ufSetHas(buildPublicCitySet([]), "ba")).toBe(false);
  });
});
