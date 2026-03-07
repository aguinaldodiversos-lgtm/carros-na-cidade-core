import { logger } from "../../shared/logger.js";
import { runMoneyPagesEngine } from "./money-pages.engine.js";
import { runClusterExecutorEngine } from "./cluster-executor.engine.js";

export async function runSeoPublishingEngine() {
  logger.info("[brain.seo-publishing] Iniciando publicação territorial");

  const [moneyPages, clusters] = await Promise.all([
    runMoneyPagesEngine(50),
    runClusterExecutorEngine(100),
  ]);

  logger.info(
    {
      moneyPages: moneyPages.length,
      clusters: clusters.length,
    },
    "[brain.seo-publishing] Publicação territorial finalizada"
  );

  return {
    moneyPages,
    clusters,
  };
}
