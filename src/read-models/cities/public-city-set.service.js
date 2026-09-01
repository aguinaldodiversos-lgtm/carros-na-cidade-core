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
 * CIDADE PÚBLICA PRIMÁRIA — a resposta a "se eu precisar de UMA cidade, qual?".
 *
 * Existe porque o frontend tinha um literal `sao-paulo-sp` como cidade padrão
 * (`FALLBACK_PUBLIC_CITY` em lib/site/public-config.ts). São Paulo tem ZERO
 * anúncios ativos, logo o gate territorial responde 404 — e o Googlebot, que
 * nunca carrega o cookie de cidade, recebia SEMPRE essa variante: cinco links
 * mortos no rodapé de toda página (auditoria SEO Fase 4, achado P1-2).
 *
 * Trocar o literal por outro literal só moveria o defeito. A cidade padrão tem
 * de ser CONSEQUÊNCIA do estoque, igual ao resto do invariante territorial.
 *
 * ── Por que aqui, e não no frontend ──────────────────────────────────────────
 * Derivamos da MESMA passagem que monta `cities`. Uma consulta nova no
 * frontend seria uma segunda fonte de verdade sobre "qual cidade existe" — o
 * padrão que produziu o bug original. E `Object.keys()` do mapa `cities` não
 * serve: o JS não garante ordem de inserção para chaves não-numéricas de forma
 * contratual, e o consumidor não deve depender de acidente de serialização.
 *
 * ── Determinismo ─────────────────────────────────────────────────────────────
 * Maior número de anúncios ativos vence. Empate resolve por slug ASC — critério
 * estável e disponível, para que dois processos leiam a mesma cidade.
 *
 * `null` quando NÃO HÁ cidade pública. Não inventamos slug: sem estoque em
 * lugar nenhum, o portal não tem cidade, e quem consome tem de degradar para
 * rota não-territorial em vez de linkar para um 404.
 *
 * @param {Record<string, number>} cities mapa slug → anúncios ativos
 * @param {Record<string, string>} ufBySlug UF por slug, para devolver junto
 * @returns {{ slug: string, uf: string|null, activeAds: number } | null}
 */
export function pickPrimaryPublicCity(cities, ufBySlug = {}) {
  let best = null;

  for (const [slug, rawTotal] of Object.entries(cities || {})) {
    const total = Number(rawTotal) || 0;
    if (total <= 0) continue;

    if (
      !best ||
      total > best.activeAds ||
      (total === best.activeAds && slug.localeCompare(best.slug) < 0)
    ) {
      best = { slug, uf: ufBySlug[slug] || ufFromCitySlug(slug) || null, activeAds: total };
    }
  }

  return best;
}

/**
 * Parte PURA — testável sem banco.
 *
 * @param {Array<{city_slug: string, state?: string, total: number}>} rows
 * @param {{ existsMinAds?: number, indexMinAds?: number }} [opts]
 * @returns {{ cities: Record<string, number>, ufs: Record<string, number>, total: number, indexable: number, primaryCity: object|null }}
 */
export function buildPublicCitySet(rows, opts = {}) {
  const existsMin = Number(opts.existsMinAds ?? getCityExistsMinAds());
  const indexMin = Number(opts.indexMinAds ?? getCityIndexMinAds());

  const cities = {};
  const ufs = {};
  /** UF por slug — só para `pickPrimaryPublicCity` devolver a UF junto. */
  const ufBySlug = {};
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

    // UF agregada da MESMA passagem — o estado é consequência das cidades, não
    // uma segunda fonte. Preferimos `row.state`; se vier vazio, derivamos do
    // sufixo do slug canônico (`atibaia-sp` → `sp`), que é o mesmo formato que
    // as rotas de UF recebem.
    const uf = normalizeUf(row?.state) || ufFromCitySlug(slug);
    if (uf) {
      ufs[uf] = (ufs[uf] || 0) + total;
      ufBySlug[slug] = uf;
    }
  }

  for (const total of Object.values(cities)) {
    if (total >= indexMin) indexable += 1;
  }

  return {
    cities,
    ufs,
    total: Object.keys(cities).length,
    indexable,
    primaryCity: pickPrimaryPublicCity(cities, ufBySlug),
  };
}

function normalizeUf(value) {
  const uf = String(value || "")
    .trim()
    .toLowerCase();
  return /^[a-z]{2}$/.test(uf) ? uf : "";
}

/** `"sao-jose-dos-campos-sp"` → `"sp"`. Vazio quando o slug não tem sufixo de UF. */
function ufFromCitySlug(slug) {
  const parts = String(slug || "")
    .split("-")
    .filter(Boolean);
  if (parts.length < 2) return "";
  return normalizeUf(parts[parts.length - 1]);
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

/**
 * A UF existe? (tem ao menos um anúncio ativo em QUALQUER cidade do estado)
 *
 * Deriva do mesmo conjunto: nenhuma consulta nova, nenhuma segunda fonte de
 * verdade. Foi a existência de fontes paralelas que causou o bug original.
 */
export function ufSetHas(set, uf) {
  return ufSetCount(set, uf) > 0;
}

/** Anúncios ativos no estado inteiro (0 se a UF não tem nenhum). */
export function ufSetCount(set, uf) {
  const key = String(uf || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z]{2}$/.test(key)) return 0;
  return Number(set?.ufs?.[key]) || 0;
}
