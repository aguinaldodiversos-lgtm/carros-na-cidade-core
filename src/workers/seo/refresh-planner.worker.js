import { logger } from "../../shared/logger.js";
import { runRefreshPlannerEngine } from "../../brain/engines/refresh-planner.engine.js";

let refreshPlannerInterval = null;
let refreshPlannerRunning = false;
let refreshPlannerStarted = false;

async function runOnce() {
  if (refreshPlannerRunning) {
    logger.warn("[refresh-planner.worker] Execução já em andamento; ignorando");
    return;
  }

  refreshPlannerRunning = true;

  try {
    await runRefreshPlannerEngine(2000);
  } catch (error) {
    logger.error({ error }, "[refresh-planner.worker] Erro no processamento");
  } finally {
    refreshPlannerRunning = false;
  }
}

export async function startRefreshPlannerWorker() {
  if (refreshPlannerStarted) {
    logger.warn("[refresh-planner.worker] Worker já inicializado");
    return;
  }

  refreshPlannerStarted = true;

  const intervalMs = Number(process.env.REFRESH_PLANNER_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000);

  logger.info({ intervalMs }, "[refresh-planner.worker] Inicializando worker");

  await runOnce();

  refreshPlannerInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[refresh-planner.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopRefreshPlannerWorker() {
  if (!refreshPlannerStarted) {
    logger.info("[refresh-planner.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (refreshPlannerInterval) {
    clearInterval(refreshPlannerInterval);
    refreshPlannerInterval = null;
  }

  refreshPlannerStarted = false;

  logger.info("[refresh-planner.worker] Worker encerrado com sucesso");
}
