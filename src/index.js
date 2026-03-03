// src/index.js
import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import runMigrations from "./infrastructure/database/migrate.js";
import { logger } from "./shared/logger.js";

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";

let server;
let shuttingDown = false;

process.on("unhandledRejection", (reason) => {
  logger.error({ message: "Unhandled Rejection", reason });
});
process.on("uncaughtException", (err) => {
  logger.error({ message: "Uncaught Exception", error: err.message });
  process.exit(1);
});

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.warn(`🛑 ${signal} recebido. Encerrando...`);

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

async function startWorkerSafe(name, path, exportName) {
  try {
    const mod = await import(path);
    const fn = mod[exportName];

    if (typeof fn === "function") {
      fn();
      logger.info(`✅ ${name} iniciado`);
    } else {
      logger.warn(`⚠️ ${name} export inválido`);
    }
  } catch {
    logger.warn(`⚠️ ${name} não carregado`);
  }
}

async function startWorkers() {
  logger.info("🚀 Inicializando workers...");

  await startWorkerSafe("Metrics Worker", "./workers/metrics.worker.js", "startMetricsWorker");
  await startWorkerSafe("Growth Brain Worker", "./workers/growthBrain.worker.js", "startGrowthBrainWorker");
  await startWorkerSafe("Growth Jobs Worker", "./workers/growth_jobs.worker.js", "startGrowthJobsWorker");

  logger.info("🏁 Workers inicializados");
}

async function startServer() {
  try {
    logger.info("🔧 Rodando migrations...");
    await runMigrations();
    logger.info("✅ Migrations concluídas.");

    server = http.createServer(app);

    server.listen(PORT, () => {
      logger.info(`🚗 API rodando na porta ${PORT} [${NODE_ENV}]`);
    });

    await startWorkers();
  } catch (err) {
    logger.error({ message: "❌ Falha ao iniciar servidor", error: err.message });
    process.exit(1);
  }
}

startServer();
