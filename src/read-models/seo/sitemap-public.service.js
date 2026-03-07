import * as sitemapPublicRepository from "./sitemap-public.repository.js";

function mapSitemapEntry(entry) {
  return {
    loc: entry.path,
    lastmod: entry.updated_at,
    priority: entry.priority,
    clusterType: entry.cluster_type,
    stage: entry.stage,
    moneyPage: entry.money_page,
    state: entry.state,
  };
}

export async function getPublicSitemap(limit = 50000) {
  const entries = await sitemapPublicRepository.listAllSitemapEntries(limit);
  return entries.map(mapSitemapEntry);
}

export async function getPublicSitemapByType(type, limit = 50000) {
  const entries = await sitemapPublicRepository.listSitemapByType(type, limit);
  return entries.map(mapSitemapEntry);
}

export async function getPublicSitemapByRegion(state, limit = 50000) {
  const entries = await sitemapPublicRepository.listSitemapByRegion(state, limit);
  return entries.map(mapSitemapEntry);
}
