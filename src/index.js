// src/index.js

import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import runMigrations from "./database/migrate.js";
import { logger } from "./shared/logger.js";

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";

/*
-----------------------------------------------------
CONFIGURAÇÃO DE WORKERS
-----------------------------------------------------

RUN_WORKERS controla se o servidor vai iniciar workers.

Web Service (Render / produção API):
RUN_WORKERS=false

Worker Service (processamento):
RUN_WORKERS=true
*/

const RUN_WORKERS =
  String(process.env.RUN_WORKERS || "false").toLowerCase() === "true";

let server;
let shuttingDown = false;

/*
-----------------------------------------------------
TRATAMENTO DE ERROS GLOBAIS
-----------------------------------------------------
*/

process.on("unhandledRejection", (reason) => {
  logger.error({
    message: "Unhandled Rejection",
    reason,
  });
});

process.on("uncaughtException", (err) => {
  logger.error({
    message: "Uncaught Exception",
    error: err?.message || String(err),
  });

  process.exit(1);
});

/*
-----------------------------------------------------
GRACEFUL SHUTDOWN
-----------------------------------------------------
*/

async function gracefulShutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  logger.warn(`🛑 ${signal} recebido. Encerrando servidor...`);

  if (server) {
    server.close(() => {
      logger.info("🔒 Servidor HTTP encerrado.");
      process.exit(0);
    });
  }

  setTimeout(() => {
    logger.error("❌ Encerramento forçado por timeout.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

/*
-----------------------------------------------------
CARREGAMENTO SEGURO DE WORKERS
-----------------------------------------------------
*/

async function startWorkerSafe(name, path, exportName) {
  try {
    const module = await import(path);
    const fn = module[exportName];

    if (typeof fn === "function") {
      await fn();
      logger.info(`✅ ${name} iniciado`);
    } else {
      logger.warn(
        `⚠️ ${name} export inválido (esperado função: ${exportName})`
      );
    }
  } catch (err) {
    logger.warn({
      message: `⚠️ ${name} não carregado`,
      error: err?.message || String(err),
    });
  }
}

/*
-----------------------------------------------------
INICIALIZAÇÃO DE WORKERS
-----------------------------------------------------
*/

async function startWorkers() {
  logger.info("🚀 Inicializando workers...");

  /*
  Flags individuais para cada worker.
  Você pode controlar tudo via ENV no Render.
  */

  const ENABLE_METRICS =
    String(process.env.ENABLE_METRICS_WORKER || "true") === "true";

  const ENABLE_GROWTH_BRAIN =
    String(process.env.ENABLE_GROWTH_BRAIN_WORKER || "true") === "true";

  const ENABLE_GROWTH_JOBS =
    String(process.env.ENABLE_GROWTH_JOBS_WORKER || "true") === "true";

  const ENABLE_EVENT_BANNER =
    String(process.env.ENABLE_EVENT_BANNER_WORKER || "false") === "true";

  const ENABLE_BANNER_GENERATOR =
    String(process.env.ENABLE_BANNER_GENERATOR_WORKER || "false") === "true";

  /*
  --------------------------------------------------
  WORKERS
  --------------------------------------------------
  */

  if (ENABLE_METRICS) {
    await startWorkerSafe(
      "Metrics Worker",
      "./workers/metrics.worker.js",
      "startMetricsWorker"
    );
  } else {
    logger.warn("⏸️ Metrics Worker desativado");
  }

  if (ENABLE_GROWTH_BRAIN) {
    await startWorkerSafe(
      "Growth Brain Worker",
      "./workers/growthBrain.worker.js",
      "startGrowthBrainWorker"
    );
  } else {
    logger.warn("⏸️ Growth Brain Worker desativado");
  }

  if (ENABLE_GROWTH_JOBS) {
    await startWorkerSafe(
      "Growth Jobs Worker",
      "./workers/growth_jobs.worker.js",
      "startGrowthJobsWorker"
    );
  } else {
    logger.warn("⏸️ Growth Jobs Worker desativado");
  }

  /*
  --------------------------------------------------
  BANNER WORKERS
  (DESATIVADOS POR PADRÃO PARA EVITAR CUSTO DE IA)
  --------------------------------------------------
  */

  if (ENABLE_EVENT_BANNER) {
    await startWorkerSafe(
      "Event Banner Worker",
      "./workers/event_banner.worker.js",
      "startEventBannerWorker"
    );
  } else {
    logger.warn("⏸️ Event Banner Worker desativado");
  }

  if (ENABLE_BANNER_GENERATOR) {
    await startWorkerSafe(
      "Banner Generator Worker",
      "./workers/banner_generator.worker.js",
      "startBannerGeneratorWorker"
    );
  } else {
    logger.warn("⏸️ Banner Generator Worker desativado");
  }

  logger.info("🏁 Workers inicializados");
}

/*
-----------------------------------------------------
START DO SERVIDOR
-----------------------------------------------------
*/

async function startServer() {
  try {
    logger.info("🔧 Rodando migrations...");
    await runMigrations();
    logger.info("✅ Migrations concluídas.");

    server = http.createServer(app);

    server.listen(PORT, () => {
      logger.info(`🚗 API rodando na porta ${PORT} [${NODE_ENV}]`);
      logger.info(
        `🧠 Workers: ${RUN_WORKERS ? "ATIVADOS" : "DESATIVADOS"}`
      );
    });

    /*
    Só inicia workers se RUN_WORKERS=true
    */

    if (RUN_WORKERS) {
      await startWorkers();
    } else {
      logger.warn(
        "🟡 Workers desabilitados (RUN_WORKERS=false). Apenas API iniciada."
      );
    }
  } catch (err) {
    logger.error({
      message: "❌ Falha ao iniciar servidor",
      error: err?.message || String(err),
    });

    process.exit(1);
  }
}

/*
-----------------------------------------------------
BOOT
-----------------------------------------------------
*/

startServer();
