// src/read-models/cities/city-seo-overview.logic.js
//
// Lógica PURA do CitySeoOverview (Fase 3, Etapas 4-6). Sem DB, sem rede —
// recebe as linhas cruas das agregações e devolve o modelo que os módulos de
// SEO local consomem. Testável isoladamente.
//
// Três responsabilidades:
//   1. Canonicalizar marca e derivar MODELO COMERCIAL (colapsando versões
//      FIPE), somando contagens por entidade real.
//   2. Aplicar a política central de qualificação (`qualifiesForSeoSurface`)
//      para dizer, por entidade, se ela pode virar link/landing/sitemap.
//   3. Aplicar os critérios de QUALIDADE ESTATÍSTICA: com amostra pequena a
//      estatística é tecnicamente correta e editorialmente inútil — pior,
//      enganosa. Ver `PRICE_STATS_MIN_SAMPLE` abaixo.

import { canonicalBrandSlug, canonicalBrandLabel } from "../../shared/utils/slugify.js";
import { deriveCommercialModel } from "../../shared/vehicle/commercial-model.js";
import { SEO_SURFACE, qualifiesForSeoSurface } from "./city-thresholds.js";

/**
 * Amostra mínima para PUBLICAR estatística de preço.
 *
 * Por que 5 e não 1: com 1 anúncio, "mediana de R$ X" é só repetir o preço
 * daquele anúncio com aparência de análise de mercado. Com 3, a mediana é
 * literalmente o anúncio do meio — qualquer entrada ou saída a move inteira.
 * 5 é o menor tamanho em que a mediana fica isolada dos dois extremos (dois
 * anúncios de cada lado), então uma oferta atípica entrando ou saindo não
 * reescreve o número da página.
 *
 * Abaixo disso a faixa (mín–máx) e a mediana simplesmente não são exibidas —
 * a contagem e as marcas continuam, porque contagem não tem esse problema.
 */
export const PRICE_STATS_MIN_SAMPLE = 5;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPositive(value) {
  const n = toNumber(value);
  return n != null && n > 0 ? n : null;
}

function toIso(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Agrupa as linhas por MARCA canônica ("GM - Chevrolet" e "Chevrolet" viram a
 * mesma entidade) e marca quais qualificam para virar landing/link.
 */
export function buildBrandEntities(rows, citySlug) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const slug = canonicalBrandSlug(row.brand);
    if (!slug) continue;

    const current = map.get(slug);
    const total = toNumber(row.total) || 0;
    const lastUpdated = toIso(row.last_updated);

    if (!current) {
      map.set(slug, {
        slug,
        label: canonicalBrandLabel(row.brand),
        activeAds: total,
        minPrice: toPositive(row.min_price),
        lastUpdated,
      });
      continue;
    }

    current.activeAds += total;
    const min = toPositive(row.min_price);
    if (min != null && (current.minPrice == null || min < current.minPrice)) {
      current.minPrice = min;
    }
    current.lastUpdated = maxIso(current.lastUpdated, lastUpdated);
  }

  return [...map.values()]
    .map((entity) => ({
      ...entity,
      qualified: qualifiesForSeoSurface(SEO_SURFACE.BRAND, entity.activeAds),
      path: `/cidade/${citySlug}/marca/${entity.slug}`,
    }))
    .sort((a, b) => b.activeAds - a.activeAds || a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * Agrupa as linhas por MODELO COMERCIAL (não por descrição FIPE). Linhas cujo
 * modelo comercial não é derivável com segurança são CONTADAS à parte
 * (`unresolved`) em vez de descartadas em silêncio — se esse número crescer, a
 * taxonomia precisa de override novo, e um zero silencioso esconderia isso.
 */
export function buildCommercialModelEntities(rows, citySlug) {
  const map = new Map();
  let unresolved = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const brandSlug = canonicalBrandSlug(row.brand);
    const commercial = deriveCommercialModel(row.model, { brand: row.brand });
    const total = toNumber(row.total) || 0;

    if (!brandSlug || !commercial) {
      unresolved += total;
      continue;
    }

    const key = `${brandSlug}::${commercial.slug}`;
    const current = map.get(key);
    const lastUpdated = toIso(row.last_updated);

    if (!current) {
      map.set(key, {
        slug: commercial.slug,
        label: commercial.label,
        source: commercial.source,
        brandSlug,
        brandLabel: canonicalBrandLabel(row.brand),
        activeAds: total,
        minPrice: toPositive(row.min_price),
        maxPrice: toPositive(row.max_price),
        minYear: toNumber(row.min_year),
        maxYear: toNumber(row.max_year),
        /** Descrições FIPE distintas que colapsaram nesta entidade. */
        fipeVersions: [String(row.model)],
        lastUpdated,
      });
      continue;
    }

    current.activeAds += total;
    const min = toPositive(row.min_price);
    if (min != null && (current.minPrice == null || min < current.minPrice)) current.minPrice = min;
    const max = toPositive(row.max_price);
    if (max != null && (current.maxPrice == null || max > current.maxPrice)) current.maxPrice = max;
    const minY = toNumber(row.min_year);
    if (minY != null && (current.minYear == null || minY < current.minYear)) current.minYear = minY;
    const maxY = toNumber(row.max_year);
    if (maxY != null && (current.maxYear == null || maxY > current.maxYear)) current.maxYear = maxY;
    if (!current.fipeVersions.includes(String(row.model))) current.fipeVersions.push(String(row.model));
    current.lastUpdated = maxIso(current.lastUpdated, lastUpdated);
  }

  const models = [...map.values()]
    .map((entity) => ({
      ...entity,
      qualified: qualifiesForSeoSurface(SEO_SURFACE.MODEL, entity.activeAds),
      path: `/cidade/${citySlug}/marca/${entity.brandSlug}/modelo/${entity.slug}`,
    }))
    .sort((a, b) => b.activeAds - a.activeAds || a.label.localeCompare(b.label, "pt-BR"));

  return { models, unresolved };
}

/** Facetas transversais (carroceria/combustível/câmbio) com qualificação própria. */
export function buildFacetEntities(rows) {
  const buckets = { bodyTypes: [], fuelTypes: [], transmissions: [] };
  const surfaceByKind = {
    body_type: SEO_SURFACE.BODY_TYPE,
    transmission: SEO_SURFACE.TRANSMISSION,
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    const value = String(row.value || "").trim();
    if (!value) continue;
    const total = toNumber(row.total) || 0;
    const surface = surfaceByKind[row.kind];
    const entry = {
      value,
      activeAds: total,
      // `fuel_type` não tem superfície SEO própria hoje — fica sem qualificação
      // em vez de ganhar uma inventada.
      qualified: surface ? qualifiesForSeoSurface(surface, total) : false,
    };

    if (row.kind === "body_type") buckets.bodyTypes.push(entry);
    else if (row.kind === "fuel_type") buckets.fuelTypes.push(entry);
    else if (row.kind === "transmission") buckets.transmissions.push(entry);
  }

  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => b.activeAds - a.activeAds);
  }

  return buckets;
}

/**
 * Estatística de preço com PORTÃO DE QUALIDADE.
 *
 * `publishable: false` significa "não exiba" — e não "não existe". Os números
 * seguem no payload para relatório interno; o que muda é a permissão de
 * publicar. A média (`avgPrice`) nunca é marcada como publicável: com amostra
 * pequena um outlier a desloca inteira, e a mediana já responde à mesma
 * pergunta sem esse risco.
 */
export function buildPriceStats(statsRow) {
  const activeAds = toNumber(statsRow?.active_ads) || 0;
  const minPrice = toPositive(statsRow?.min_price);
  const maxPrice = toPositive(statsRow?.max_price);
  const medianPrice = toPositive(statsRow?.median_price);
  const avgPrice = toPositive(statsRow?.avg_price);
  const publishable = activeAds >= PRICE_STATS_MIN_SAMPLE && minPrice != null && maxPrice != null;

  return {
    minPrice,
    maxPrice,
    medianPrice: medianPrice != null ? Math.round(medianPrice) : null,
    avgPrice: avgPrice != null ? Math.round(avgPrice) : null,
    sampleSize: activeAds,
    minSample: PRICE_STATS_MIN_SAMPLE,
    publishable,
  };
}

/**
 * Cruza os membros do raio (vizinhança geográfica) com o inventário ativo.
 * Só entram cidades que TÊM superfície pública própria — a regra é a mesma da
 * cidade principal (`SEO_SURFACE.CITY`), então nunca linkamos para uma página
 * que responderia noindex.
 */
export function buildNearbyCities(members, countRows) {
  const counts = new Map();
  for (const row of Array.isArray(countRows) ? countRows : []) {
    counts.set(String(row.city_slug || "").toLowerCase(), toNumber(row.total) || 0);
  }

  return (Array.isArray(members) ? members : [])
    .map((member) => {
      const slug = String(member?.slug || "").toLowerCase();
      const activeAds = counts.get(slug) || 0;
      const distanceKm = toNumber(member?.distance_km);
      return {
        slug,
        name: member?.name || "",
        state: member?.state || "",
        distanceKm: distanceKm != null ? Math.round(distanceKm) : null,
        activeAds,
        qualified: qualifiesForSeoSurface(SEO_SURFACE.CITY, activeAds),
        path: `/carros-em/${slug}`,
      };
    })
    .filter((city) => city.slug && city.qualified)
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
}

/** Lojistas públicos com estoque na cidade. Sem telefone, e-mail ou endereço. */
export function buildDealerEntities(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      slug: String(row.slug || ""),
      name: String(row.name || "").trim(),
      activeAds: toNumber(row.active_ads) || 0,
      minPrice: toPositive(row.min_price),
      path: `/lojas/${String(row.slug || "")}`,
    }))
    .filter((dealer) => dealer.slug && dealer.name && dealer.activeAds > 0);
}
