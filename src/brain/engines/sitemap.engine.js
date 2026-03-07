import { logger } from "../../shared/logger.js";
import { buildTerritorialSitemap } from "../../read-models/seo/sitemap.service.js";

export async function runSitemapEngine(limit = 50000) {
  logger.info({ limit }, "[brain.sitemap] Iniciando sitemap territorial");

  const entries = await buildTerritorialSitemap(limit);

  logger.info(
    { totalEntries: entries.length },
    "[brain.sitemap] Sitemap territorial finalizado"
  );

  return entries;
}
