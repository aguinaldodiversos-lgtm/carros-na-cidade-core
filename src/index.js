import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import runMigrations from "./infrastructure/database/migrate.js";
import { logger } from "./shared/logger.js";
import { collectExternalData } from "./workers/dataCollector.worker.js";

/* =====================================================
   CONFIG
===================================================== */

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const server = http.createServer(app);

let isShuttingDown = false;

/* =====================================================
   TRATAMENTO GLOBAL DE ERROS NÃO CAPTURADOS
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
    err,
  });
  process.exit(1);
});

/* =====================================================
   SHUTDOWN GRACIOSO
===================================================== */

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn(`🛑 Recebido ${signal}. Encerrando servidor...`);

  server.close(() => {
    logger.info("🔒 Servidor HTTP encerrado.");
    process.exit(0);
  });

  // Timeout máximo de segurança
  setTimeout(() => {
    logger.error("❌ Forçando encerramento.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

/* =====================================================
   WORKER LOADER SEGURO
===================================================== */

async function startWorkerSafe(name, path, exportName) {
  try {
    const module = await import(path);
    const workerFn = module[exportName];

    if (typeof workerFn === "function") {
      workerFn();
      logger.info(`✅ ${name} iniciado`);
    } else {
      logger.warn(`⚠️ ${name} exportação não encontrada`);
    }
  } catch (err) {
    logger.warn(`⚠️ ${name} não carregado`);
  }
}

/* =====================================================
   INICIAR WORKERS
===================================================== */

async function startWorkers() {
  logger.info("🚀 Iniciando Workers...");

  await startWorkerSafe(
    "Strategy Worker",
    "./workers/strategy.worker.js",
    "startStrategyWorker"
  );

  await startWorkerSafe(
    "Autopilot Worker",
    "./workers/autopilot.worker.js",
    "startAutopilotWorker"
  );

  await startWorkerSafe(
    "Opportunity Engine",
    "./workers/opportunity_engine.js",
    "startOpportunityEngine"
  );

  await startWorkerSafe(
    "SEO Worker",
    "./workers/seo.worker.js",
    "startSeoWorker"
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
    "City Metrics Worker",
    "./workers/city_metrics.worker.js",
    "startCityMetricsWorker"
  );

  await startWorkerSafe(
    "Alert Match Worker",
    "./workers/alert_match.worker.js",
    "startAlertMatchWorker"
  );

  // WhatsApp Worker opcional
  try {
    const whatsapp = await import("./workers/whatsapp.worker.js");
    if (typeof whatsapp.startWhatsappWorker === "function") {
      whatsapp.startWhatsappWorker();
      logger.info("📲 WhatsApp Worker iniciado");
    }
  } catch {
    logger.warn("⚠️ WhatsApp Worker não encontrado");
  }

  logger.info("🏁 Todos os workers processados");
}

/* =====================================================
   START DO SERVIDOR
===================================================== */

async function startServer() {
  try {
    logger.info("🔧 Executando migrations...");
    await runMigrations();
    logger.info("✅ Migrations concluídas");

    server.listen(PORT, () => {
      logger.info(
        `🚗 API Carros na Cidade rodando na porta ${PORT} [${NODE_ENV}]`
      );
    });

    // Worker de coleta externa periódica
    setInterval(collectExternalData, 30 * 60 * 1000);

    // Inicializa workers
    await startWorkers();

  } catch (err) {
    logger.error({
      message: "❌ Erro ao iniciar servidor",
      err,
    });
    process.exit(1);
  }
}

startServer();
