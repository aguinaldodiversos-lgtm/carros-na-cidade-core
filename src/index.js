// src/index.js
import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import runMigrations from "./database/migrate.js";
import { logger } from "./shared/logger.js";

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";

// ✅ Por padrão: NÃO iniciar workers dentro do web-service
// Ative explicitamente com: RUN_WORKERS=true
const RUN_WORKERS = String(process.env.RUN_WORKERS || "false").toLowerCase() === "true";

let server;
let shuttingDown = false;

process.on("unhandledRejection", (reason) => {
  logger.error({ message: "Unhandled Rejection", reason });
});
process.on("uncaughtException", (err) => {
  logger.error({ message: "Uncaught Exception", error: err?.message || String(err) });
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
      await fn();
      logger.info(`✅ ${name} iniciado`);
    } else {
      logger.warn(`⚠️ ${name} export inválido (esperado função: ${exportName})`);
    }
  } catch (err) {
    logger.warn({
      message: `⚠️ ${name} não carregado`,
      error: err?.message || String(err),
    });
  }
}

async function startWorkers() {
  logger.info("🚀 Inicializando workers...");

  // ✅ Flags por worker (você controla no Render sem mexer no código)
  const ENABLE_METRICS = String(process.env.ENABLE_METRICS_WORKER || "true").toLowerCase() === "true";
  const ENABLE_GROWTH_BRAIN = String(process.env.ENABLE_GROWTH_BRAIN_WORKER || "true").toLowerCase() === "true";
  const ENABLE_GROWTH_JOBS = String(process.env.ENABLE_GROWTH_JOBS_WORKER || "true").toLowerCase() === "true";

  // ❌ BANNERS DESLIGADOS POR PADRÃO (pra não gastar IA em deploy/test)
  const ENABLE_EVENT_BANNER = String(process.env.ENABLE_EVENT_BANNER_WORKER || "false").toLowerCase() === "true";
  const ENABLE_BANNER_GENERATOR = String(process.env.ENABLE_BANNER_GENERATOR_WORKER || "false").toLowerCase() === "true";

  if (ENABLE_METRICS) {
    await startWorkerSafe("Metrics Worker", "./workers/metrics.worker.js", "startMetricsWorker");
  } else {
    logger.warn("⏸️ Metrics Worker desativado por ENV");
  }

  if (ENABLE_GROWTH_BRAIN) {
    await startWorkerSafe("Growth Brain Worker", "./workers/growthBrain.worker.js", "startGrowthBrainWorker");
  } else {
    logger.warn("⏸️ Growth Brain Worker desativado por ENV");
  }

  if (ENABLE_GROWTH_JOBS) {
    await startWorkerSafe("Growth Jobs Worker", "./workers/growth_jobs.worker.js", "startGrowthJobsWorker");
  } else {
    logger.warn("⏸️ Growth Jobs Worker desativado por ENV");
  }

  // ✅ Mantemos os banners disponíveis, mas desligados por padrão.
  // (se você quiser ligar depois, basta setar ENV=true)
  if (ENABLE_EVENT_BANNER) {
    // Se seu worker for CommonJS (require/module.exports), não carregue via import aqui.
    // O ideal é rodar em um worker-service separado (npm run workers).
    logger.warn("⚠️ ENABLE_EVENT_BANNER_WORKER=true, mas recomendado rodar via worker-service separado.");
  }

  if (ENABLE_BANNER_GENERATOR) {
    logger.warn("⚠️ ENABLE_BANNER_GENERATOR_WORKER=true, mas recomendado rodar via worker-service separado.");
  }

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
      logger.info(`🧩 Workers no web-service: ${RUN_WORKERS ? "ATIVADOS" : "DESATIVADOS"}`);
    });

    // ✅ Somente se você ativar explicitamente
    if (RUN_WORKERS) {
      await startWorkers();
    }
  } catch (err) {
    logger.error({
      message: "❌ Falha ao iniciar servidor",
      error: err?.message || String(err),
    });
    process.exit(1);
  }
}

startServer();
