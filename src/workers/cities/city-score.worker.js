import { logger } from "../../shared/logger.js";
import { runCityScoreEngine } from "../../brain/engines/city-score.engine.js";

let cityScoreInterval = null;
let cityScoreRunning = false;
let cityScoreStarted = false;

async function runOnce() {
  if (cityScoreRunning) {
    logger.warn("[city-score.worker] Execução já em andamento; ignorando");
    return;
  }

  cityScoreRunning = true;

  try {
    await runCityScoreEngine(2000);
  } catch (error) {
    logger.error({ error }, "[city-score.worker] Erro no processamento");
  } finally {
    cityScoreRunning = false;
  }
}

export async function startCityScoreWorker() {
  if (cityScoreStarted) {
    logger.warn("[city-score.worker] Worker já inicializado");
    return;
  }

  cityScoreStarted = true;

  const intervalMs = Number(
    process.env.CITY_SCORE_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[city-score.worker] Inicializando worker");

  await runOnce();

  cityScoreInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[city-score.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopCityScoreWorker() {
  if (!cityScoreStarted) {
    logger.info("[city-score.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (cityScoreInterval) {
    clearInterval(cityScoreInterval);
    cityScoreInterval = null;
  }

  cityScoreStarted = false;

  logger.info("[city-score.worker] Worker encerrado com sucesso");
}
