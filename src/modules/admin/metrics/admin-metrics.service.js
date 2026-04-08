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
 * SEO city metrics may come from either `seo_city_metrics` or `city_seo_metrics`,
 * depending on which table exists in the current environment.
 * The repository tries both tables and returns data from whichever is available.
 *
 * KNOWN LIMITATION: Neither table has a migration in the main SQL migration folder.
 * They are created by external workers/collectors and may not exist in fresh environments.
 */
export async function getSeoCityMetrics(options) {
  return repo.getSeoCityMetrics(options);
}
