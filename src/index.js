// src/index.js

import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import runMigrations from "./database/migrate.js";
import { logger } from "./shared/logger.js";
import { startWorkersBootstrap } from "./workers/bootstrap.js";

/* =====================================================
   CONFIG
===================================================== */

const PORT = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || "development";

const RUN_MIGRATIONS =
  String(process.env.RUN_MIGRATIONS || "true").toLowerCase() === "true";

let server = null;
let shuttingDown = false;

/* =====================================================
   PROCESS-LEVEL ERROR HANDLERS
===================================================== */

process.on("unhandledRejection", (reason) => {
  logger.error({
    message: "❌ Unhandled Rejection",
    reason: reason instanceof Error ? reason.message : reason,
  });
});

process.on("uncaughtException", (err) => {
  logger.error({
    message: "❌ Uncaught Exception",
    error: err?.message || String(err),
    stack: err?.stack,
  });

  process.exit(1);
});

/* =====================================================
   SHUTDOWN
===================================================== */

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.warn({
    message: "🛑 Sinal de encerramento recebido",
    signal,
  });

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      logger.info("🔒 Servidor HTTP encerrado com sucesso.");
    }

    process.exit(0);
  } catch (err) {
    logger.error({
      message: "❌ Erro durante graceful shutdown",
      error: err?.message || String(err),
    });

    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
  try {
    logger.info({
      message: "🚀 Inicializando aplicação",
      env: NODE_ENV,
      port: PORT,
      runMigrations: RUN_MIGRATIONS,
      runWorkers:
        String(process.env.RUN_WORKERS || "false").toLowerCase() === "true",
    });

    if (RUN_MIGRATIONS) {
      logger.info("🔧 Rodando migrations...");
      await runMigrations();
      logger.info("✅ Migrations concluídas.");
    } else {
      logger.warn("⏭️ RUN_MIGRATIONS=false → migrations ignoradas.");
    }

    server = http.createServer(app);

    server.listen(PORT, "0.0.0.0", async () => {
      logger.info(`🚗 API rodando na porta ${PORT} [${NODE_ENV}]`);

      try {
        await startWorkersBootstrap();
      } catch (err) {
        logger.error({
          message: "❌ Falha ao iniciar bootstrap de workers",
          error: err?.message || String(err),
        });
      }
    });

    server.on("error", (err) => {
      logger.error({
        message: "❌ Erro no servidor HTTP",
        error: err?.message || String(err),
      });

      process.exit(1);
    });
  } catch (err) {
    logger.error({
      message: "❌ Falha ao iniciar servidor",
      error: err?.message || String(err),
      stack: err?.stack,
    });

    process.exit(1);
  }
}

/* =====================================================
   BOOT
===================================================== */

startServer();
