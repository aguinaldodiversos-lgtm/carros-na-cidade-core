// src/read-models/seo/territorial-inventory-sitemap.service.js
//
// Constrói as entradas dos sitemaps brands/models a partir do estoque ativo
// real. A parte pura (`buildBrandEntries`/`buildModelEntries`) é testável sem
// DB: slugifica marca/modelo com o helper canônico (mesmo do resolvedor das
// páginas, garantindo que a URL do sitemap RESOLVA para uma página indexável)
// e deduplica por `loc` (duas grafias que slugificam igual viram uma URL,
// somando a contagem e mantendo o `lastmod` mais recente).

import { brandModelSlug } from "../../shared/utils/slugify.js";
import * as repo from "./territorial-inventory-sitemap.repository.js";

const CLUSTER_TYPE_BRAND = "city_brand";
const CLUSTER_TYPE_BRAND_MODEL = "city_brand_model";

function toLastmodTs(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function dedupeByLoc(items) {
  const map = new Map();

  for (const item of items) {
    if (!item || !item.loc) continue;
    const current = map.get(item.loc);
    if (!current) {
      map.set(item.loc, item);
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

  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .map((item) => ({
      loc: item.loc,
      lastmod: item.lastmodTs != null ? new Date(item.lastmodTs).toISOString() : null,
      clusterType: item.clusterType,
      state: item.state,
    }));
}

/** PURA: linhas de marca → entradas de sitemap (slug canônico, deduplicado). */
export function buildBrandEntries(rows) {
  const items = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const citySlug = String(row.city_slug || "").trim();
      const brandSlug = brandModelSlug(row.brand);
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

  return dedupeByLoc(items);
}

/** PURA: linhas de modelo → entradas de sitemap (slug canônico, deduplicado). */
export function buildModelEntries(rows) {
  const items = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const citySlug = String(row.city_slug || "").trim();
      const brandSlug = brandModelSlug(row.brand);
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

  return dedupeByLoc(items);
}

export async function listActiveCityBrandEntries(limit = 50000) {
  const rows = await repo.listActiveCityBrandRows(limit);
  return buildBrandEntries(rows);
}

export async function listActiveCityBrandModelEntries(limit = 50000) {
  const rows = await repo.listActiveCityBrandModelRows(limit);
  return buildModelEntries(rows);
}
