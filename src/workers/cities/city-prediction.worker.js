import { logger } from "../../shared/logger.js";
import { runCityPredictionEngine } from "../../brain/engines/prediction.engine.js";

let cityPredictionInterval = null;
let cityPredictionRunning = false;
let cityPredictionStarted = false;

async function runOnce() {
  if (cityPredictionRunning) {
    logger.warn("[city-prediction.worker] Execução já em andamento; ignorando");
    return;
  }

  cityPredictionRunning = true;

  try {
    await runCityPredictionEngine();
  } catch (error) {
    logger.error({ error }, "[city-prediction.worker] Erro no processamento");
  } finally {
    cityPredictionRunning = false;
  }
}

export async function startCityPredictionWorker() {
  if (cityPredictionStarted) {
    logger.warn("[city-prediction.worker] Worker já inicializado");
    return;
  }

  cityPredictionStarted = true;

  const intervalMs = Number(process.env.CITY_PREDICTION_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000);

  logger.info({ intervalMs }, "[city-prediction.worker] Inicializando worker");

  await runOnce();

  cityPredictionInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[city-prediction.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopCityPredictionWorker() {
  if (!cityPredictionStarted) {
    logger.info("[city-prediction.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (cityPredictionInterval) {
    clearInterval(cityPredictionInterval);
    cityPredictionInterval = null;
  }

  cityPredictionStarted = false;

  logger.info("[city-prediction.worker] Worker encerrado com sucesso");
}
