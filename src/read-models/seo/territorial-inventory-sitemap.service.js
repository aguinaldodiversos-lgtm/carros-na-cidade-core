// src/read-models/seo/territorial-inventory-sitemap.service.js
//
// Constrói as entradas dos sitemaps cidade/brands/models a partir do ESTOQUE
// ATIVO real (tabela `ads`). A parte pura (`buildCityEntries`/`buildBrandEntries`
// /`buildModelEntries`) é testável sem DB: slugifica com os helpers canônicos
// (marca = `canonicalBrandSlug`, que faz o strip do prefixo de grupo FIPE
// "GM - Chevrolet" → "chevrolet"; modelo = `brandModelSlug`), deduplica por
// `loc` (grafias que slugificam igual viram uma URL, somando a contagem) e
// aplica o limiar `minAds` DEPOIS da dedup (por isso o filtro não pode ficar no
// SQL — "GM - Chevrolet" 2 + "Chevrolet" 2 = 4 ≥ 3, mas cada linha isolada é 2).
//
// A URL de cidade é a CANÔNICA `/carros-em/[slug]` (não `/cidade` nem
// `/comprar/cidade`) — auditoria SEO 2026-07-04.

import { brandModelSlug, canonicalBrandSlug } from "../../shared/utils/slugify.js";
import * as repo from "./territorial-inventory-sitemap.repository.js";
import { getSitemapMinAds } from "./sitemap-min-ads.js";

const CLUSTER_TYPE_CITY = "city_home";
const CLUSTER_TYPE_BELOW_FIPE = "city_below_fipe";
const CLUSTER_TYPE_BRAND = "city_brand";
const CLUSTER_TYPE_BRAND_MODEL = "city_brand_model";

function toLastmodTs(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Deduplica por `loc`, somando `total` e mantendo o `lastmod` mais recente. */
function dedupeByLoc(items) {
  const map = new Map();

  for (const item of items) {
    if (!item || !item.loc) continue;
    const current = map.get(item.loc);
    if (!current) {
      map.set(item.loc, { ...item });
      continue;
    }
    current.total += item.total;
    if (
      item.lastmodTs != null &&
      (current.lastmodTs == null || item.lastmodTs > current.lastmodTs)
    ) {
      current.lastmodTs = item.lastmodTs;
    }
  }

  return [...map.values()];
}

/**
 * Aplica o limiar (`>= minAds`) DEPOIS da dedup, ordena por volume e devolve a
 * forma final da entrada de sitemap (sem `total`). `minAds` default 1 preserva
 * o comportamento dos testes puros; os wrappers `listActive*` passam
 * `getSitemapMinAds()` (default 3 em prod).
 */
function finalize(deduped, minAds) {
  const threshold = Math.max(1, Number(minAds) || 1);
  return deduped
    .filter((item) => (Number(item.total) || 0) >= threshold)
    .sort((a, b) => b.total - a.total)
    .map((item) => ({
      loc: item.loc,
      lastmod: item.lastmodTs != null ? new Date(item.lastmodTs).toISOString() : null,
      clusterType: item.clusterType,
      state: item.state,
    }));
}

/** PURA: linhas de cidade → entradas `/carros-em/[slug]` (canônica, ≥ minAds). */
export function buildCityEntries(rows, minAds = 1) {
  const items = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const citySlug = String(row.city_slug || "").trim();
      if (!citySlug) return null;
      return {
        loc: `/carros-em/${citySlug}`,
        total: Number(row.total) || 0,
        lastmodTs: toLastmodTs(row.last_updated),
        clusterType: CLUSTER_TYPE_CITY,
        state: row.state || undefined,
      };
    })
    .filter(Boolean);

  return finalize(dedupeByLoc(items), minAds);
}

/** PURA: linhas below-fipe → entradas `/carros-baratos-em/[slug]` (canônica, ≥ minAds). */
export function buildBelowFipeCityEntries(rows, minAds = 1) {
  const items = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const citySlug = String(row.city_slug || "").trim();
      if (!citySlug) return null;
      return {
        loc: `/carros-baratos-em/${citySlug}`,
        total: Number(row.total) || 0,
        lastmodTs: toLastmodTs(row.last_updated),
        clusterType: CLUSTER_TYPE_BELOW_FIPE,
        state: row.state || undefined,
      };
    })
    .filter(Boolean);

  return finalize(dedupeByLoc(items), minAds);
}

/** PURA: linhas de marca → entradas de sitemap (slug canônico, dedup, ≥ minAds). */
export function buildBrandEntries(rows, minAds = 1) {
  const items = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const citySlug = String(row.city_slug || "").trim();
      const brandSlug = canonicalBrandSlug(row.brand);
      if (!citySlug || !brandSlug) return null;
      return {
        loc: `/cidade/${citySlug}/marca/${brandSlug}`,
        total: Number(row.total) || 0,
        lastmodTs: toLastmodTs(row.last_updated),
        clusterType: CLUSTER_TYPE_BRAND,
        state: row.state || undefined,
      };
    })
    .filter(Boolean);

  return finalize(dedupeByLoc(items), minAds);
}

/** PURA: linhas de modelo → entradas de sitemap (slugs canônicos, dedup, ≥ minAds). */
export function buildModelEntries(rows, minAds = 1) {
  const items = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const citySlug = String(row.city_slug || "").trim();
      const brandSlug = canonicalBrandSlug(row.brand);
      const modelSlug = brandModelSlug(row.model);
      if (!citySlug || !brandSlug || !modelSlug) return null;
      return {
        loc: `/cidade/${citySlug}/marca/${brandSlug}/modelo/${modelSlug}`,
        total: Number(row.total) || 0,
        lastmodTs: toLastmodTs(row.last_updated),
        clusterType: CLUSTER_TYPE_BRAND_MODEL,
        state: row.state || undefined,
      };
    })
    .filter(Boolean);

  return finalize(dedupeByLoc(items), minAds);
}

export async function listActiveCityEntries(limit = 50000) {
  const rows = await repo.listActiveCityRows(limit);
  return buildCityEntries(rows, getSitemapMinAds());
}

export async function listActiveCityBelowFipeEntries(limit = 50000) {
  const rows = await repo.listActiveCityBelowFipeRows(limit);
  return buildBelowFipeCityEntries(rows, getSitemapMinAds());
}

export async function listActiveCityBrandEntries(limit = 50000) {
  const rows = await repo.listActiveCityBrandRows(limit);
  return buildBrandEntries(rows, getSitemapMinAds());
}

export async function listActiveCityBrandModelEntries(limit = 50000) {
  const rows = await repo.listActiveCityBrandModelRows(limit);
  return buildModelEntries(rows, getSitemapMinAds());
}
