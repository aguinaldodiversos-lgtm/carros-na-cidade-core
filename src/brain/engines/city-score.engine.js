import { logger } from "../../shared/logger.js";
import * as citiesScoreService from "../../modules/cities/cities-score.service.js";

export async function runCityScoreEngine(limit = 1500) {
  logger.info({ limit }, "[brain.city-score] Iniciando rebuild de city scores");

  const result = await citiesScoreService.rebuildCityScores(limit);

  logger.info(
    { processed: result.processed },
    "[brain.city-score] Rebuild de city scores finalizado"
  );

  return result;
}
