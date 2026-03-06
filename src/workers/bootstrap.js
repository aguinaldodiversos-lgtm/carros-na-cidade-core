// src/workers/bootstrap.js

import { logger } from "../shared/logger.js";
import { startAiWorker, stopAiWorker } from "./ai.worker.js";
import { startStrategyWorker, stopStrategyWorker } from "./strategy.worker.js";
import { startAutopilotWorker, stopAutopilotWorker } from "./autopilot.worker.js";
import { startSeoWorker, stopSeoWorker } from "./seo.worker.js";
import { startWhatsAppWorker, stopWhatsAppWorker } from "./whatsapp.worker.js";

/* =====================================================
   HELPERS
===================================================== */

function isEnabled(envName, defaultValue = "false") {
  return String(process.env[envName] ?? defaultValue).toLowerCase() === "true";
}

async function startWorkerSafe(workerConfig) {
  const { name, env, defaultValue = "false", start } = workerConfig;

  const enabled = isEnabled(env, defaultValue);

  if (!enabled) {
    logger.info({ worker: name, env }, "⏸️ Worker desativado");
    return {
      name,
      env,
      enabled: false,
      started: false,
      success: true,
      stopAvailable: false,
      error: null,
    };
  }

  if (typeof start !== "function") {
    logger.warn({ worker: name }, "⚠️ Worker não iniciado: export de start inválido");
    return {
      name,
      env,
      enabled: true,
      started: false,
      success: false,
      stopAvailable: false,
      error: "Export de start inválido",
    };
  }

  try {
    await start();

    logger.info({ worker: name }, "✅ Worker iniciado com sucesso");

    return {
      name,
      env,
      enabled: true,
      started: true,
      success: true,
      stopAvailable: true,
      error: null,
    };
  } catch (error) {
    logger.error(
      {
        worker: name,
        error,
      },
      "❌ Falha ao iniciar worker"
    );

    return {
      name,
      env,
      enabled: true,
      started: false,
      success: false,
      stopAvailable: false,
      error: error?.message || String(error),
    };
  }
}

async function stopWorkerSafe(workerConfig) {
  const { name, stop } = workerConfig;

  if (typeof stop !== "function") {
    logger.warn({ worker: name }, "⚠️ Worker sem rotina de shutdown");
    return {
      name,
      stopped: false,
      success: false,
      error: "Export de stop inválido",
    };
  }

  try {
    await stop();

    logger.info({ worker: name }, "🛑 Worker encerrado com sucesso");

    return {
      name,
      stopped: true,
      success: true,
      error: null,
    };
  } catch (error) {
    logger.error(
      {
        worker: name,
        error,
      },
      "❌ Falha ao encerrar worker"
    );

    return {
      name,
      stopped: false,
      success: false,
      error: error?.message || String(error),
    };
  }
}

/* =====================================================
   REGISTRY DE WORKERS
===================================================== */

const WORKERS_REGISTRY = [
  {
    name: "AI Worker",
    env: "RUN_WORKER_AI",
    defaultValue: "true",
    start: startAiWorker,
    stop: stopAiWorker,
  },
  {
    name: "Strategy Worker",
    env: "RUN_WORKER_STRATEGY",
    defaultValue: "false",
    start: startStrategyWorker,
    stop: stopStrategyWorker,
  },
  {
    name: "Autopilot Worker",
    env: "RUN_WORKER_AUTOPILOT",
    defaultValue: "false",
    start: startAutopilotWorker,
    stop: stopAutopilotWorker,
  },
  {
    name: "SEO Worker",
    env: "RUN_WORKER_SEO",
    defaultValue: "false",
    start: startSeoWorker,
    stop: stopSeoWorker,
  },
  {
    name: "WhatsApp Worker",
    env: "RUN_WORKER_WHATSAPP",
    defaultValue: "true",
    start: startWhatsAppWorker,
    stop: stopWhatsAppWorker,
  },
];

/* =====================================================
   ESTADO INTERNO DO BOOTSTRAP
===================================================== */

let startedWorkers = [];
let bootstrapStarted = false;

/* =====================================================
   STARTUP
===================================================== */

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

  if (bootstrapStarted) {
    logger.warn("[workers.bootstrap] Bootstrap já executado; ignorando nova inicialização");
    return {
      started: true,
      total: WORKERS_REGISTRY.length,
      enabled: startedWorkers.length,
      successful: startedWorkers.length,
      failed: 0,
      results: startedWorkers.map((worker) => ({
        name: worker.name,
        enabled: true,
        started: true,
        success: true,
        stopAvailable: typeof worker.stop === "function",
        error: null,
      })),
    };
  }

  logger.info(
    { totalWorkersRegistered: WORKERS_REGISTRY.length },
    "🚀 Iniciando bootstrap de workers..."
  );

  const results = await Promise.all(
    WORKERS_REGISTRY.map((worker) => startWorkerSafe(worker))
  );

  startedWorkers = WORKERS_REGISTRY.filter((worker, index) => {
    const result = results[index];
    return result.enabled && result.started && result.success;
  });

  bootstrapStarted = true;

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

/* =====================================================
   SHUTDOWN
===================================================== */

export async function stopWorkersBootstrap() {
  if (!bootstrapStarted) {
    logger.info("[workers.bootstrap] Nenhum bootstrap ativo para encerrar");
    return {
      stopped: true,
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  if (startedWorkers.length === 0) {
    bootstrapStarted = false;

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
    { activeWorkers: startedWorkers.map((worker) => worker.name) },
    "🛑 Encerrando workers..."
  );

  const shutdownOrder = [...startedWorkers].reverse();

  const results = [];
  for (const worker of shutdownOrder) {
    const result = await stopWorkerSafe(worker);
    results.push(result);
  }

  const successfulStops = results.filter((item) => item.success);
  const failedStops = results.filter((item) => !item.success);

  startedWorkers = [];
  bootstrapStarted = false;

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
