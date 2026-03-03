import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import runMigrations from "./infrastructure/database/migrate.js";
import { logger } from "./shared/logger.js";
import { collectExternalData } from "./workers/dataCollector.worker.js";

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";

let server;
let isShuttingDown = false;

/* =====================================================
   TRATAMENTO GLOBAL DE ERROS
===================================================== */

process.on("unhandledRejection", (reason) => {
  logger.error({
    message: "Unhandled Rejection",
    reason,
  });
});

process.on("uncaughtException", (err) => {
  logger.error({
    message: "Uncaught Exception",
    error: err.message,
  });
  process.exit(1);
});

/* =====================================================
   SHUTDOWN GRACIOSO
===================================================== */

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn(`🛑 ${signal} recebido. Encerrando servidor...`);

  if (server) {
    server.close(() => {
      logger.info("🔒 Servidor HTTP encerrado.");
      process.exit(0);
    });
  }

  setTimeout(() => {
    logger.error("❌ Forçando encerramento após timeout.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

/* =====================================================
   LOADER SEGURO DE WORKERS
===================================================== */

async function startWorkerSafe(name, path, exportName) {
  try {
    const module = await import(path);
    const workerFn = module[exportName];

    if (typeof workerFn === "function") {
      workerFn();
      logger.info(`✅ ${name} iniciado`);
    } else {
      logger.warn(`⚠️ ${name} não exporta função válida`);
    }
  } catch (err) {
    logger.warn(`⚠️ ${name} não carregado`);
  }
}

/* =====================================================
   INICIAR TODOS OS WORKERS
===================================================== */

async function startWorkers() {
  logger.info("🚀 Inicializando Workers...");

  await startWorkerSafe(
    "Metrics Worker",
    "./workers/metrics.worker.js",
    "startMetricsWorker"
  );

  await startWorkerSafe(
    "City Dominance Worker",
    "./workers/city_dominance.worker.js",
    "startCityDominanceWorker"
  );

  await startWorkerSafe(
    "Growth Dominance Worker",
    "./workers/growth_dominance.worker.js",
    "startGrowthDominanceWorker"
  );

  await startWorkerSafe(
    "Growth Jobs Worker",
    "./workers/growth_jobs.worker.js",
    "startGrowthJobsWorker"
  );

  await startWorkerSafe(
    "SEO Worker",
    "./workers/seo.worker.js",
    "startSeoWorker"
  );

  await startWorkerSafe(
    "Strategy Worker",
    "./workers/strategy.worker.js",
    "startStrategyWorker"
  );

  await startWorkerSafe(
    "Opportunity Engine",
    "./workers/opportunity_engine.js",
    "startOpportunityEngine"
  );

  await startWorkerSafe(
    "Alert Match Worker",
    "./workers/alert_match.worker.js",
    "startAlertMatchWorker"
  );

  // WhatsApp opcional
  try {
    const whatsapp = await import("./workers/whatsapp.worker.js");
    if (typeof whatsapp.startWhatsappWorker === "function") {
      whatsapp.startWhatsappWorker();
      logger.info("📲 WhatsApp Worker iniciado");
    }
  } catch {
    logger.warn("⚠️ WhatsApp Worker não encontrado");
  }

  logger.info("🏁 Workers inicializados");
}

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
  try {
    logger.info("🔧 Executando migrations...");
    await runMigrations();
    logger.info("✅ Migrations concluídas");

    server = http.createServer(app);

    server.listen(PORT, () => {
      logger.info(
        `🚗 API Carros na Cidade rodando na porta ${PORT} [${NODE_ENV}]`
      );
    });

    /* =====================================================
       WORKER PERIÓDICO DE COLETA EXTERNA
    ===================================================== */
    setInterval(() => {
      try {
        collectExternalData();
      } catch (err) {
        logger.warn("⚠️ Erro na coleta externa");
      }
    }, 30 * 60 * 1000);

    await startWorkers();

  } catch (err) {
    logger.error({
      message: "❌ Falha ao iniciar servidor",
      error: err.message,
    });
    process.exit(1);
  }
}

startServer();
