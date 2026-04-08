import * as repo from "./admin-metrics.repository.js";

export async function getTopAds(options) {
  return repo.getTopAds(options);
}

export async function getCityMetrics(options) {
  return repo.getCityMetrics(options);
}

export async function getRecentEvents(options) {
  return repo.getRecentEvents(options);
}

/**
 * SEO city metrics from canonical `seo_city_metrics` table.
 * Created by migration 015. Legacy `city_seo_metrics` is a backward-compatible VIEW.
 * Returns empty array if no data has been collected yet (fresh environment).
 */
export async function getSeoCityMetrics(options) {
  return repo.getSeoCityMetrics(options);
}
