// src/read-models/cities/territorial-cluster.logic.js
//
// Lógica PURA (sem DB) da indexação dinâmica das páginas territoriais de
// cluster cidade+marca[+modelo]. Separada do service/repository para ser
// testável isoladamente (vitest) sem mock de pool.
//
// Responsabilidades:
//   1. Resolver um slug de marca/modelo (vindo da URL) para os valores REAIS
//      de `ads.brand`/`ads.model` presentes no estoque ativo — corrigindo o
//      bug histórico em que o backend comparava `LOWER(brand) = LOWER(slug)`
//      (falhava p/ "Land Rover" → "land-rover" e dependia de substring na
//      listagem, deixando "gol" puxar "Golf").
//   2. Agregar contagem/estatística de forma EXATA por slug.
//   3. Construir o objeto `seo` com robots dinâmico baseado em estoque ativo.

import { brandModelSlug, canonicalBrandSlug } from "../../shared/utils/slugify.js";

/** Titulariza um slug (`"land-rover"` → `"Land Rover"`) para rótulo de fallback. */
export function titleizeSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Filtra as linhas de agregação (uma por valor real de brand/model) cujo
 * slug canônico bate EXATAMENTE com o slug pedido. Resolve por slug, nunca
 * por substring — `slugify("Golf") = "golf" !== "gol"`.
 *
 * @param {Array<{value:string}>} rows linhas com a chave informada em `key`
 * @param {string} slug slug pedido na URL
 * @param {string} key nome do campo que carrega o texto real ("brand"|"model")
 */
export function matchRowsBySlug(rows, slug, key) {
  // Marca usa o slug canônico (strip do prefixo de grupo FIPE "GM - Chevrolet"
  // → "chevrolet"); modelo mantém o slug ingênuo (não pode sofrer strip, senão
  // "HB 20"→"hb-20" quebraria). Ambos os lados (URL e valor real do banco)
  // passam pela MESMA função, garantindo o casamento.
  const slugFn = key === "brand" ? canonicalBrandSlug : brandModelSlug;
  const target = slugFn(slug);
  if (!target) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const real = row && row[key];
    return real != null && slugFn(real) === target;
  });
}

/**
 * Agrega múltiplas linhas (variações textuais que slugificam igual — ex.
 * "VW" e "Volkswagen" não, mas "Fiat" e "FIAT" sim) numa única estatística
 * exata. `avg_price` é recomputado a partir de `sum_price`/`total` (média
 * ponderada real, não média de médias).
 */
export function aggregateMatchedRows(matchedRows, { labelKey, slug }) {
  const rows = Array.isArray(matchedRows) ? matchedRows : [];

  let activeCount = 0;
  let highlightCount = 0;
  let belowFipeCount = 0;
  let sumPrice = 0;
  let minPrice = null;
  let maxPrice = null;
  let minYear = null;
  let maxYear = null;
  let lastUpdated = null;
  let labelRow = null;

  for (const row of rows) {
    const total = toNumber(row.total) || 0;
    activeCount += total;
    highlightCount += toNumber(row.highlight) || 0;
    belowFipeCount += toNumber(row.below_fipe) || 0;
    sumPrice += toNumber(row.sum_price) || 0;

    const rMin = toNumber(row.min_price);
    if (rMin != null) minPrice = minPrice == null ? rMin : Math.min(minPrice, rMin);
    const rMax = toNumber(row.max_price);
    if (rMax != null) maxPrice = maxPrice == null ? rMax : Math.max(maxPrice, rMax);

    const rMinY = toNumber(row.min_year);
    if (rMinY != null) minYear = minYear == null ? rMinY : Math.min(minYear, rMinY);
    const rMaxY = toNumber(row.max_year);
    if (rMaxY != null) maxYear = maxYear == null ? rMaxY : Math.max(maxYear, rMaxY);

    if (row.last_updated) {
      const ts = new Date(row.last_updated).getTime();
      if (Number.isFinite(ts) && (lastUpdated == null || ts > lastUpdated)) {
        lastUpdated = ts;
      }
    }

    // rótulo de exibição = variação com maior volume
    if (!labelRow || total > (toNumber(labelRow.total) || 0)) labelRow = row;
  }

  const label = labelRow && labelRow[labelKey] ? String(labelRow[labelKey]) : titleizeSlug(slug);

  return {
    activeCount,
    hasActiveInventory: activeCount > 0,
    values: rows.map((r) => String(r[labelKey])).filter(Boolean),
    label,
    stats: {
      total: activeCount,
      highlight: highlightCount,
      belowFipe: belowFipeCount,
      minPrice,
      maxPrice,
      avgPrice: activeCount > 0 ? Math.round(sumPrice / activeCount) : null,
      minYear,
      maxYear,
    },
    lastUpdated: lastUpdated != null ? new Date(lastUpdated).toISOString() : null,
  };
}

/**
 * Constrói o objeto `seo` da página territorial com robots DINÂMICO baseado
 * em estoque ativo. Esta é a fonte de verdade de indexação do backend; o
 * frontend (`shouldIndexTerritorialPage`) apenas reforça defensivamente.
 *
 * Regra unificada (auditoria SEO 2026-07-04): o MESMO limiar de estoque decide
 * indexação e presença no sitemap (ver `sitemap-min-ads.js`).
 *   activeCount >= minInventory → index,follow
 *   activeCount  < minInventory → noindex,follow (estoque insuficiente p/
 *     competir; proteção anti-thin-content)
 *
 * `minInventory` default 1 (mantém o comportamento histórico nos testes puros);
 * os services passam `getSitemapMinAds()` (default 3 em prod). `hasActiveInventory`
 * segue verdadeiro (count>0) — quem decide o robots é `indexable`.
 *
 * `canonicalPath` é SEMPRE o path self resolvido (slugs canônicos). Nunca
 * retorna "/" — o frontend depende disso para não auto-canonicalizar p/ home.
 */
export function buildClusterSeo({ canonicalPath, title, description, activeCount, minInventory = 1 }) {
  const count = toNumber(activeCount) || 0;
  const min = Math.max(1, toNumber(minInventory) || 1);
  const hasActiveInventory = count > 0;
  const indexable = count >= min;

  return {
    title,
    description,
    canonicalPath,
    robots: indexable ? "index,follow" : "noindex,follow",
    indexable,
    hasActiveInventory,
    activeCount: count,
    noindexReason: indexable
      ? null
      : hasActiveInventory
        ? "below_min_inventory"
        : "no_active_inventory",
  };
}
