import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import runMigrations from "./database/migrate.js";
import { logger } from "./shared/logger.js";
import {
  startWorkersBootstrap,
  stopWorkersBootstrap,
} from "./workers/bootstrap.js";
import { closeWhatsAppQueue } from "./queues/whatsapp.queue.js";
import { closeQueueRedisConnection } from "./infrastructure/queue/redis.connection.js";
import { closeDatabasePool } from "./infrastructure/database/db.js";

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const RUN_MIGRATIONS =
  String(process.env.RUN_MIGRATIONS || "true").toLowerCase() === "true";
const RUN_WORKERS =
  String(process.env.RUN_WORKERS || "false").toLowerCase() === "true";
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 15000);

let server = null;
let shuttingDown = false;
let shutdownTimeout = null;

function formatError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }
  return { message: String(error) };
}

function forceShutdown(code = 1) {
  if (shutdownTimeout) {
    clearTimeout(shutdownTimeout);
    shutdownTimeout = null;
  }
  process.exit(code);
}

async function closeHttpServer() {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

async function closeInfrastructureResources() {
  await Promise.allSettled([
    closeWhatsAppQueue(),
    closeQueueRedisConnection(),
    closeDatabasePool(),
  ]);
}

process.on("unhandledRejection", (reason) => {
  logger.error({ error: formatError(reason) }, "[index] unhandled rejection");
});

process.on("uncaughtException", async (error) => {
  logger.error({ error: formatError(error) }, "[index] uncaught exception");
  try {
    await gracefulShutdown("uncaughtException");
  } catch {
    forceShutdown(1);
  }
});

async function gracefulShutdown(signal = "unknown") {
  if (shuttingDown) return;
  shuttingDown = true;

  shutdownTimeout = setTimeout(() => {
    logger.error(
      { timeoutMs: SHUTDOWN_TIMEOUT_MS },
      "[index] graceful shutdown timeout"
    );
    forceShutdown(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    logger.warn({ signal }, "[index] iniciando graceful shutdown");
    await closeHttpServer();
    await stopWorkersBootstrap();
    await closeInfrastructureResources();
    logger.info("[index] graceful shutdown concluído");
    forceShutdown(0);
  } catch (error) {
    logger.error({ error: formatError(error) }, "[index] erro no shutdown");
    forceShutdown(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

async function runStartupMigrations() {
  if (!RUN_MIGRATIONS) return;
  await runMigrations();
}

async function createAndListenHttpServer() {
  server = http.createServer(app);

  server.on("error", (error) => {
    logger.error({ error: formatError(error) }, "[index] erro no servidor");
    gracefulShutdown("server_error").catch(() => forceShutdown(1));
  });

  await new Promise((resolve, reject) => {
    server.listen(PORT, HOST, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });

  logger.info({ host: HOST, port: PORT, env: NODE_ENV }, "[index] api online");
}

async function runStartupWorkers() {
  if (!RUN_WORKERS) return;
  await startWorkersBootstrap();
}

async function startServer() {
  try {
    logger.info(
      {
        env: NODE_ENV,
        host: HOST,
        port: PORT,
        runMigrations: RUN_MIGRATIONS,
        runWorkers: RUN_WORKERS,
      },
      "[index] inicializando aplicação"
    );

    await runStartupMigrations();
    await createAndListenHttpServer();
    await runStartupWorkers();
  } catch (error) {
    logger.error({ error: formatError(error) }, "[index] falha no boot");
    await gracefulShutdown("startup_failure");
  }
}

startServer().catch((error) => {
  logger.error({ error: formatError(error) }, "[index] erro fatal no boot");
  forceShutdown(1);
});
