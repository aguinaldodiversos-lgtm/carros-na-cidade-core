import { logger } from "../../shared/logger.js";
import * as moneyPagesService from "../../read-models/seo/money-pages.service.js";
import * as contentPublisherService from "../../modules/seo/publishing/content-publisher.service.js";

export async function runMoneyPagesEngine(limit = 100) {
  logger.info({ limit }, "[brain.money-pages] Iniciando geração de money pages");

  const candidates = await moneyPagesService.getTopMoneyPageCandidates(limit);
  const results = [];

  for (const cluster of candidates) {
    const publication = await contentPublisherService.publishClusterContent(cluster);
    results.push(publication);
  }

  logger.info(
    { totalPublished: results.length },
    "[brain.money-pages] Geração de money pages finalizada"
  );

  return results;
}
