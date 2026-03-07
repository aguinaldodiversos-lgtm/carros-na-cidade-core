import { logger } from "../../shared/logger.js";
import * as clusterExecutorService from "../../modules/seo/publishing/cluster-executor.service.js";

export async function runClusterExecutorEngine(limit = 100) {
  logger.info({ limit }, "[brain.cluster-executor] Iniciando executor de clusters");

  const results = await clusterExecutorService.executeTopPendingClusters(limit);

  logger.info(
    { totalExecuted: results.length },
    "[brain.cluster-executor] Executor de clusters finalizado"
  );

  return results;
}
