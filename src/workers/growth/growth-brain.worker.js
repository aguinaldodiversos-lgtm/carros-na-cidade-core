import { logger } from "../../shared/logger.js";
import { runGrowthBrainEngine } from "../../brain/engines/growth-brain.engine.js";

let growthBrainInterval = null;
let growthBrainRunning = false;
let growthBrainStarted = false;

async function runOnce() {
  if (growthBrainRunning) {
    logger.warn("[growth-brain.worker] Execução já em andamento; ignorando");
    return;
  }

  growthBrainRunning = true;

  try {
    await runGrowthBrainEngine();
  } catch (error) {
    logger.error({ error }, "[growth-brain.worker] Erro no processamento");
  } finally {
    growthBrainRunning = false;
  }
}

export async function startGrowthBrainWorker() {
  if (growthBrainStarted) {
    logger.warn("[growth-brain.worker] Worker já inicializado");
    return;
  }

  growthBrainStarted = true;

  const intervalMs = Number(process.env.GROWTH_BRAIN_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000);

  logger.info({ intervalMs }, "[growth-brain.worker] Inicializando worker");

  await runOnce();

  growthBrainInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[growth-brain.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopGrowthBrainWorker() {
  if (!growthBrainStarted) {
    logger.info("[growth-brain.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (growthBrainInterval) {
    clearInterval(growthBrainInterval);
    growthBrainInterval = null;
  }

  growthBrainStarted = false;

  logger.info("[growth-brain.worker] Worker encerrado com sucesso");
}
