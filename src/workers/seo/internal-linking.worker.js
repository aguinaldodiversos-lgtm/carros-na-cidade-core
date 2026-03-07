import { logger } from "../../shared/logger.js";
import { runInternalLinkingEngine } from "../../brain/engines/internal-linking.engine.js";
import * as citiesScoreService from "../../modules/cities/cities-score.service.js";

let internalLinkingInterval = null;
let internalLinkingRunning = false;
let internalLinkingStarted = false;

async function runOnce() {
  if (internalLinkingRunning) {
    logger.warn("[internal-linking.worker] Execução já em andamento; ignorando");
    return;
  }

  internalLinkingRunning = true;

  try {
    const cities = await citiesScoreService.getTopRankedCities(200);

    for (const city of cities) {
      await runInternalLinkingEngine(city.city_id);
    }
  } catch (error) {
    logger.error({ error }, "[internal-linking.worker] Erro no processamento");
  } finally {
    internalLinkingRunning = false;
  }
}

export async function startInternalLinkingWorker() {
  if (internalLinkingStarted) {
    logger.warn("[internal-linking.worker] Worker já inicializado");
    return;
  }

  internalLinkingStarted = true;

  const intervalMs = Number(
    process.env.INTERNAL_LINKING_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info(
    { intervalMs },
    "[internal-linking.worker] Inicializando worker"
  );

  await runOnce();

  internalLinkingInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error(
        { error },
        "[internal-linking.worker] Erro na execução agendada"
      );
    });
  }, intervalMs);
}

export async function stopInternalLinkingWorker() {
  if (!internalLinkingStarted) {
    logger.info("[internal-linking.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (internalLinkingInterval) {
    clearInterval(internalLinkingInterval);
    internalLinkingInterval = null;
  }

  internalLinkingStarted = false;

  logger.info("[internal-linking.worker] Worker encerrado com sucesso");
}
