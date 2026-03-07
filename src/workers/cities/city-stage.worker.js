import { logger } from "../../shared/logger.js";
import { runCityStageEngine } from "../../brain/engines/city-stage.engine.js";

let cityStageInterval = null;
let cityStageRunning = false;
let cityStageStarted = false;

async function runOnce() {
  if (cityStageRunning) {
    logger.warn("[city-stage.worker] Execução já em andamento; ignorando");
    return;
  }

  cityStageRunning = true;

  try {
    await runCityStageEngine(1000);
  } catch (error) {
    logger.error({ error }, "[city-stage.worker] Erro no processamento");
  } finally {
    cityStageRunning = false;
  }
}

export async function startCityStageWorker() {
  if (cityStageStarted) {
    logger.warn("[city-stage.worker] Worker já inicializado");
    return;
  }

  cityStageStarted = true;

  const intervalMs = Number(
    process.env.CITY_STAGE_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[city-stage.worker] Inicializando worker");

  await runOnce();

  cityStageInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[city-stage.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopCityStageWorker() {
  if (!cityStageStarted) {
    logger.info("[city-stage.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (cityStageInterval) {
    clearInterval(cityStageInterval);
    cityStageInterval = null;
  }

  cityStageStarted = false;

  logger.info("[city-stage.worker] Worker encerrado com sucesso");
}
