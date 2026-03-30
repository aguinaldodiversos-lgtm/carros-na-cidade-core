import { logger } from "../../shared/logger.js";
import { WORKERS_REGISTRY } from "./bootstrap.registry.js";
import { isEnabled, startWorkerSafe, stopWorkerSafe } from "./bootstrap.helpers.js";
import { bootstrapState } from "./bootstrap.state.js";

export async function startWorkersBootstrap() {
  const runWorkers = isEnabled("RUN_WORKERS", "false");

  if (!runWorkers) {
    logger.info("🧊 RUN_WORKERS=false → workers não serão iniciados.");
    return {
      started: false,
      total: 0,
      enabled: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  if (bootstrapState.bootstrapStarted) {
    logger.warn("[workers.bootstrap] Bootstrap já executado; ignorando nova inicialização");

    return {
      started: true,
      total: bootstrapState.startedWorkers.length,
      enabled: bootstrapState.startedWorkers.length,
      successful: bootstrapState.startedWorkers.length,
      failed: 0,
      results: bootstrapState.startedWorkers,
    };
  }

  logger.info(
    { totalWorkersRegistered: WORKERS_REGISTRY.length },
    "🚀 Iniciando bootstrap de workers..."
  );

  const results = await Promise.all(WORKERS_REGISTRY.map((worker) => startWorkerSafe(worker)));

  bootstrapState.startedWorkers = results.filter(
    (result) => result.enabled && result.started && result.success
  );

  bootstrapState.bootstrapStarted = true;

  const enabledWorkers = results.filter((item) => item.enabled);
  const successfulWorkers = results.filter((item) => item.enabled && item.started && item.success);
  const failedWorkers = results.filter((item) => item.enabled && !item.success);

  const summary = {
    started: true,
    total: WORKERS_REGISTRY.length,
    enabled: enabledWorkers.length,
    successful: successfulWorkers.length,
    failed: failedWorkers.length,
    results,
  };

  logger.info(
    {
      total: summary.total,
      enabled: summary.enabled,
      successful: summary.successful,
      failed: summary.failed,
    },
    "🏁 Bootstrap de workers finalizado"
  );

  if (failedWorkers.length > 0) {
    logger.warn(
      {
        failedWorkers: failedWorkers.map((worker) => ({
          name: worker.name,
          error: worker.error,
        })),
      },
      "⚠️ Alguns workers falharam na inicialização"
    );
  }

  return summary;
}

export async function stopWorkersBootstrap() {
  if (!bootstrapState.bootstrapStarted) {
    logger.info("[workers.bootstrap] Nenhum bootstrap ativo para encerrar");
    return {
      stopped: true,
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  if (bootstrapState.startedWorkers.length === 0) {
    bootstrapState.bootstrapStarted = false;

    logger.info("[workers.bootstrap] Nenhum worker ativo para encerrar");
    return {
      stopped: true,
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  logger.info(
    {
      activeWorkers: bootstrapState.startedWorkers.map((worker) => worker.name),
    },
    "🛑 Encerrando workers..."
  );

  const shutdownOrder = [...bootstrapState.startedWorkers].reverse();

  const results = [];
  for (const worker of shutdownOrder) {
    const result = await stopWorkerSafe(worker);
    results.push(result);
  }

  const successfulStops = results.filter((item) => item.success);
  const failedStops = results.filter((item) => !item.success);

  bootstrapState.startedWorkers = [];
  bootstrapState.bootstrapStarted = false;

  const summary = {
    stopped: true,
    total: results.length,
    successful: successfulStops.length,
    failed: failedStops.length,
    results,
  };

  logger.info(
    {
      total: summary.total,
      successful: summary.successful,
      failed: summary.failed,
    },
    "🏁 Shutdown de workers finalizado"
  );

  if (failedStops.length > 0) {
    logger.warn(
      {
        failedWorkers: failedStops.map((worker) => ({
          name: worker.name,
          error: worker.error,
        })),
      },
      "⚠️ Alguns workers falharam no encerramento"
    );
  }

  return summary;
}
