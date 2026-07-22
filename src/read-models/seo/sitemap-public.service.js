import * as sitemapPublicRepository from "./sitemap-public.repository.js";
import { CLUSTER_TYPES } from "../../modules/seo/constants/seo-status.js";
import {
  listActiveCityEntries,
  listActiveCityBelowFipeEntries,
  listActiveCityBrandEntries,
  listActiveCityBrandModelEntries,
} from "./territorial-inventory-sitemap.service.js";
import { listActiveAdRows } from "./sitemap-ads.repository.js";

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
  // Cidade/marca/modelo passam a ser geradas a partir do ESTOQUE ATIVO real
  // (tabela `ads`), não de `seo_cluster_plans` (que não valida estoque e podia
  // listar combinações vazias). Regra unificada (auditoria SEO 2026-07-04): só
  // entram URLs com >= SITEMAP_MIN_ADS anúncios ativos — o MESMO limiar da
  // indexação. A cidade usa a URL CANÔNICA `/carros-em/[slug]` (nunca `/cidade`
  // nem `/comprar/cidade`). `lastmod` = MAX(ads.updated_at). Demais tipos
  // (below_fipe, opportunities…) seguem via cluster plans.
  if (type === CLUSTER_TYPES.CITY_HOME) {
    return listActiveCityEntries(limit);
  }
  if (type === CLUSTER_TYPES.CITY_BELOW_FIPE) {
    // Correção 2026-07-05: below-fipe também por ESTOQUE ATIVO real (só cidades
    // com >= SITEMAP_MIN_ADS anúncios abaixo da FIPE), URL canônica
    // /carros-baratos-em/[slug]. Antes vinha de seo_cluster_plans sem filtro e
    // listava cidades sem estoque (ex.: Bragança Paulista com 0).
    return listActiveCityBelowFipeEntries(limit);
  }
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

/**
 * Sitemap de VEÍCULOS: uma URL `/veiculo/[slug]` por anúncio ATIVO. Emite o
 * `ads.slug` armazenado (casa com o lookup de `/veiculo/[slug]`), `lastmod` =
 * `ads.updated_at`. Não vem de `seo_cluster_plans` (que é só landings).
 */
export async function getPublicVehicleSitemap(limit = 50000) {
  const rows = await listActiveAdRows(limit);
  return rows.map((row) => ({
    loc: `/veiculo/${row.slug}`,
    lastmod: row.last_updated,
    changefreq: "weekly",
    priority: 0.6,
  }));
}
