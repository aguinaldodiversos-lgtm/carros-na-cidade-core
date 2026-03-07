import { logger } from "../../shared/logger.js";
import { runClusterPlannerEngine } from "../../brain/engines/cluster-planner.engine.js";

let clusterPlannerInterval = null;
let clusterPlannerRunning = false;
let clusterPlannerStarted = false;

async function runOnce() {
  if (clusterPlannerRunning) {
    logger.warn("[cluster-planner.worker] Execução já em andamento; ignorando");
    return;
  }

  clusterPlannerRunning = true;

  try {
    await runClusterPlannerEngine(200);
  } catch (error) {
    logger.error({ error }, "[cluster-planner.worker] Erro no processamento");
  } finally {
    clusterPlannerRunning = false;
  }
}

export async function startClusterPlannerWorker() {
  if (clusterPlannerStarted) {
    logger.warn("[cluster-planner.worker] Worker já inicializado");
    return;
  }

  clusterPlannerStarted = true;

  const intervalMs = Number(
    process.env.CLUSTER_PLANNER_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info(
    { intervalMs },
    "[cluster-planner.worker] Inicializando worker"
  );

  await runOnce();

  clusterPlannerInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error(
        { error },
        "[cluster-planner.worker] Erro na execução agendada"
      );
    });
  }, intervalMs);
}

export async function stopClusterPlannerWorker() {
  if (!clusterPlannerStarted) {
    logger.info("[cluster-planner.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (clusterPlannerInterval) {
    clearInterval(clusterPlannerInterval);
    clusterPlannerInterval = null;
  }

  clusterPlannerStarted = false;

  logger.info("[cluster-planner.worker] Worker encerrado com sucesso");
}
