import { logger } from "../shared/logger.js";
import { startAiWorker } from "./ai.worker.js";
import { startStrategyWorker } from "./strategy.worker.js";
import { startAutopilotWorker } from "./autopilot.worker.js";
import { startSeoWorker } from "./seo.worker.js";
import { startWhatsAppWorker } from "./whatsapp.worker.js";

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
      enabled: false,
      started: false,
      success: true,
      error: null,
    };
  }

  if (typeof start !== "function") {
    logger.warn({ worker: name }, "⚠️ Worker não iniciado: export inválido");
    return {
      name,
      enabled: true,
      started: false,
      success: false,
      error: "Export inválido",
    };
  }

  try {
    await start();

    logger.info({ worker: name }, "✅ Worker iniciado com sucesso");

    return {
      name,
      enabled: true,
      started: true,
      success: true,
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
      enabled: true,
      started: false,
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
  },
  {
    name: "Strategy Worker",
    env: "RUN_WORKER_STRATEGY",
    defaultValue: "false",
    start: startStrategyWorker,
  },
  {
    name: "Autopilot Worker",
    env: "RUN_WORKER_AUTOPILOT",
    defaultValue: "false",
    start: startAutopilotWorker,
  },
  {
    name: "SEO Worker",
    env: "RUN_WORKER_SEO",
    defaultValue: "false",
    start: startSeoWorker,
  },
  {
    name: "WhatsApp Worker",
    env: "RUN_WORKER_WHATSAPP",
    defaultValue: "true",
    start: startWhatsAppWorker,
  },
];

/* =====================================================
   BOOTSTRAP PRINCIPAL
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

  logger.info(
    {
      totalWorkersRegistered: WORKERS_REGISTRY.length,
    },
    "🚀 Iniciando bootstrap de workers..."
  );

  const results = await Promise.all(
    WORKERS_REGISTRY.map((worker) => startWorkerSafe(worker))
  );

  const enabledWorkers = results.filter((item) => item.enabled);
  const successfulWorkers = results.filter((item) => item.success && item.started);
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
