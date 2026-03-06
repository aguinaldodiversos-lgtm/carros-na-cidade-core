// src/workers/bootstrap.js

import { logger } from "../shared/logger.js";
import { startAiWorker } from "./ai.worker.js";
import { startStrategyWorker } from "./strategy.worker.js";
import { startAutopilotWorker } from "./autopilot.worker.js";
import { startSeoWorker } from "./seo.worker.js";

/* =====================================================
   HELPERS
===================================================== */

function isEnabled(envName, defaultValue = "false") {
  return String(process.env[envName] || defaultValue).toLowerCase() === "true";
}

async function startWorkerSafe(name, fn) {
  try {
    if (typeof fn !== "function") {
      logger.warn(`⚠️ ${name} não iniciado: export inválido`);
      return;
    }

    await fn();
    logger.info(`✅ ${name} iniciado`);
  } catch (err) {
    logger.error({
      message: `❌ Falha ao iniciar ${name}`,
      error: err?.message || String(err),
    });
  }
}

/* =====================================================
   BOOTSTRAP PRINCIPAL
===================================================== */

export async function startWorkersBootstrap() {
  const runWorkers = isEnabled("RUN_WORKERS", "false");

  if (!runWorkers) {
    logger.info("🧊 RUN_WORKERS=false → workers não serão iniciados.");
    return;
  }

  logger.info("🚀 Iniciando Workers Isolados...");

  const runAiWorker = isEnabled("RUN_WORKER_AI", "true");
  const runStrategyWorker = isEnabled("RUN_WORKER_STRATEGY", "false");
  const runAutopilotWorker = isEnabled("RUN_WORKER_AUTOPILOT", "false");
  const runSeoWorker = isEnabled("RUN_WORKER_SEO", "false");

  if (runAiWorker) {
    await startWorkerSafe("AI Worker", startAiWorker);
  } else {
    logger.info("⏸️ AI Worker desativado");
  }

  if (runStrategyWorker) {
    await startWorkerSafe("Strategy Worker", startStrategyWorker);
  } else {
    logger.info("⏸️ Strategy Worker desativado");
  }

  if (runAutopilotWorker) {
    await startWorkerSafe("Autopilot Worker", startAutopilotWorker);
  } else {
    logger.info("⏸️ Autopilot Worker desativado");
  }

  if (runSeoWorker) {
    await startWorkerSafe("SEO Worker", startSeoWorker);
  } else {
    logger.info("⏸️ SEO Worker desativado");
  }

  logger.info("🏁 Workers inicializados");
}
