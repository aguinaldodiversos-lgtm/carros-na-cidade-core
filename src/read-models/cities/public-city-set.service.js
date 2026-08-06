// src/read-models/cities/public-city-set.service.js
//
// FONTE ÚNICA do conjunto de cidades públicas.
//
//   "Uma cidade só existe a partir do momento em que um anunciante publica um
//    anúncio nela. O conjunto de cidades públicas NÃO é uma lista. É o
//    resultado de SELECT DISTINCT cidade FROM ads WHERE ativo."
//
// Toda rota pública, todo gerador de link e o sitemap consomem ESTA função.
// Nenhum outro caminho decide se uma cidade existe. O bug original nasceu
// exatamente de a regra ter sido aplicada rota a rota — `tabela-fipe` e `blog`
// ficaram de fora e serviam `index,follow` para qualquer slug terminado em UF
// válida (superfície ilimitada, não os 5.570 municípios).
//
// NÃO CONFUNDIR com o catálogo de municípios (`/api/public/cities/search`,
// tabela `cities` semeada do IBGE). Aquele é catálogo de ENTRADA e existe para
// UM caso: o wizard de anúncio, onde o vendedor escolhe qualquer município — é
// esse ato que cria a cidade. Este aqui é CONSEQUÊNCIA dos dados.
//
// Formato de retorno pensado para o gate no middleware Edge: um mapa
// `slug → total` para lookup O(1). Devolver o CONJUNTO INTEIRO (e não um
// endpoint por slug) é deliberado — o tráfego que precisamos barrar é de
// crawler varrendo milhares de slugs distintos. Por slug, seriam milhares de
// chamadas ao backend; com o conjunto, é uma só, cacheada.

import { listActiveCityRows } from "../seo/territorial-inventory-sitemap.repository.js";
import { getCityExistsMinAds, getCityIndexMinAds } from "./city-thresholds.js";

/** Teto defensivo: o conjunto é pequeno por natureza (só cidades COM estoque). */
const MAX_ROWS = 100000;

/**
 * Parte PURA — testável sem banco.
 *
 * @param {Array<{city_slug: string, state?: string, total: number}>} rows
 * @param {{ existsMinAds?: number, indexMinAds?: number }} [opts]
 * @returns {{ cities: Record<string, number>, total: number, indexable: number }}
 */
export function buildPublicCitySet(rows, opts = {}) {
  const existsMin = Number(opts.existsMinAds ?? getCityExistsMinAds());
  const indexMin = Number(opts.indexMinAds ?? getCityIndexMinAds());

  const cities = {};
  let indexable = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const slug = String(row?.city_slug || "")
      .trim()
      .toLowerCase();
    if (!slug) continue;

    const total = Number(row?.total) || 0;
    if (total < existsMin) continue;

    // Grafias distintas que slugificam igual somam (mesma defesa do sitemap).
    cities[slug] = (cities[slug] || 0) + total;
  }

  for (const total of Object.values(cities)) {
    if (total >= indexMin) indexable += 1;
  }

  return { cities, total: Object.keys(cities).length, indexable };
}

/**
 * Conjunto de cidades públicas, direto do estoque ativo.
 *
 * @returns {Promise<{ cities: Record<string, number>, total: number, indexable: number, existsMinAds: number, indexMinAds: number }>}
 */
export async function getPublicCitySet() {
  const rows = await listActiveCityRows(MAX_ROWS);
  const existsMinAds = getCityExistsMinAds();
  const indexMinAds = getCityIndexMinAds();

  return {
    ...buildPublicCitySet(rows, { existsMinAds, indexMinAds }),
    existsMinAds,
    indexMinAds,
  };
}

/**
 * A cidade existe? (≥ `CITY_EXISTS_MIN_ADS` anúncios ativos)
 *
 * Conveniência para chamadores que já têm o conjunto em mãos — evita que cada
 * um reimplemente a comparação e volte a divergir.
 */
export function citySetHas(set, slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  if (!key) return false;
  return Object.prototype.hasOwnProperty.call(set?.cities || {}, key);
}

/** Quantos anúncios ativos a cidade tem no conjunto (0 se não existe). */
export function citySetCount(set, slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  if (!key) return 0;
  return Number(set?.cities?.[key]) || 0;
}
