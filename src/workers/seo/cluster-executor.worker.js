import { logger } from "../../shared/logger.js";
import { runClusterExecutorEngine } from "../../brain/engines/cluster-executor.engine.js";

let clusterExecutorInterval = null;
let clusterExecutorRunning = false;
let clusterExecutorStarted = false;

async function runOnce() {
  if (clusterExecutorRunning) {
    logger.warn("[cluster-executor.worker] Execução já em andamento; ignorando");
    return;
  }

  clusterExecutorRunning = true;

  try {
    await runClusterExecutorEngine(150);
  } catch (error) {
    logger.error({ error }, "[cluster-executor.worker] Erro no processamento");
  } finally {
    clusterExecutorRunning = false;
  }
}

export async function startClusterExecutorWorker() {
  if (clusterExecutorStarted) {
    logger.warn("[cluster-executor.worker] Worker já inicializado");
    return;
  }

  clusterExecutorStarted = true;

  const intervalMs = Number(
    process.env.CLUSTER_EXECUTOR_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info(
    { intervalMs },
    "[cluster-executor.worker] Inicializando worker"
  );

  await runOnce();

  clusterExecutorInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error(
        { error },
        "[cluster-executor.worker] Erro na execução agendada"
      );
    });
  }, intervalMs);
}

export async function stopClusterExecutorWorker() {
  if (!clusterExecutorStarted) {
    logger.info("[cluster-executor.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (clusterExecutorInterval) {
    clearInterval(clusterExecutorInterval);
    clusterExecutorInterval = null;
  }

  clusterExecutorStarted = false;

  logger.info("[cluster-executor.worker] Worker encerrado com sucesso");
}
