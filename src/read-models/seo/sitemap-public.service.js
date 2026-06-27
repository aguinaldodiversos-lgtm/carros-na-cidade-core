import * as sitemapPublicRepository from "./sitemap-public.repository.js";
import { CLUSTER_TYPES } from "../../modules/seo/constants/seo-status.js";
import {
  listActiveCityBrandEntries,
  listActiveCityBrandModelEntries,
} from "./territorial-inventory-sitemap.service.js";

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

export async function getPublicSitemapByType(type, limit = 50000) {
  // Marca/modelo passam a ser geradas a partir do ESTOQUE ATIVO real (tabela
  // `ads`), não de `seo_cluster_plans`. Garante que só combinações com pelo
  // menos 1 anúncio ativo entrem no sitemap (sem páginas vazias/noindex) e
  // que o `lastmod` reflita MAX(ads.updated_at). Demais tipos seguem usando
  // os cluster plans.
  if (type === CLUSTER_TYPES.CITY_BRAND) {
    return listActiveCityBrandEntries(limit);
  }
  if (type === CLUSTER_TYPES.CITY_BRAND_MODEL) {
    return listActiveCityBrandModelEntries(limit);
  }

  const entries = await sitemapPublicRepository.listSitemapByType(type, limit);
  return entries.map(mapSitemapEntry);
}

export async function getPublicSitemapByRegion(state, limit = 50000) {
  const entries = await sitemapPublicRepository.listSitemapByRegion(state, limit);
  return entries.map(mapSitemapEntry);
}
