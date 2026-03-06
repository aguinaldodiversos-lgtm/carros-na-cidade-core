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

/* =====================================================
   CONFIG
===================================================== */

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const RUN_MIGRATIONS =
  String(process.env.RUN_MIGRATIONS || "true").toLowerCase() === "true";

const RUN_WORKERS =
  String(process.env.RUN_WORKERS || "false").toLowerCase() === "true";

const SHUTDOWN_TIMEOUT_MS = Number(
  process.env.SHUTDOWN_TIMEOUT_MS || 15000
);

let server = null;
let shuttingDown = false;
let shutdownTimeout = null;

/* =====================================================
   HELPERS
===================================================== */

function formatError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  return {
    message: String(error),
  };
}

function forceShutdown(code = 1) {
  if (shutdownTimeout) {
    clearTimeout(shutdownTimeout);
    shutdownTimeout = null;
  }

  process.exit(code);
}

async function closeHttpServer() {
  if (!server) {
    logger.info("[index] Nenhum servidor HTTP ativo para encerrar");
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) return reject(error);
      resolve();
    });
  });

  logger.info("[index] Servidor HTTP encerrado com sucesso");
}

async function closeInfrastructureResources() {
  const results = await Promise.allSettled([
    closeWhatsAppQueue(),
    closeQueueRedisConnection(),
  ]);

  const failures = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.status === "rejected");

  if (failures.length > 0) {
    logger.warn(
      {
        failures: failures.map(({ index, result }) => ({
          resource:
            index === 0
              ? "closeWhatsAppQueue"
              : "closeQueueRedisConnection",
          error:
            result.status === "rejected"
              ? formatError(result.reason)
              : null,
        })),
      },
      "[index] Alguns recursos de infraestrutura falharam no encerramento"
    );
  } else {
    logger.info("[index] Recursos de infraestrutura encerrados com sucesso");
  }
}

/* =====================================================
   PROCESS-LEVEL ERROR HANDLERS
===================================================== */

process.on("unhandledRejection", (reason) => {
  logger.error(
    {
      error: formatError(reason),
    },
    "❌ Unhandled Rejection"
  );
});

process.on("uncaughtException", async (error) => {
  logger.error(
    {
      error: formatError(error),
    },
    "❌ Uncaught Exception"
  );

  try {
    await gracefulShutdown("uncaughtException");
  } catch {
    forceShutdown(1);
  }
});

/* =====================================================
   SHUTDOWN
===================================================== */

async function gracefulShutdown(signal = "unknown") {
  if (shuttingDown) {
    logger.warn({ signal }, "[index] Shutdown já em andamento; ignorando novo sinal");
    return;
  }

  shuttingDown = true;

  logger.warn({ signal }, "🛑 Iniciando graceful shutdown...");

  shutdownTimeout = setTimeout(() => {
    logger.error(
      {
        timeoutMs: SHUTDOWN_TIMEOUT_MS,
      },
      "❌ Timeout no graceful shutdown; encerrando processo à força"
    );

    forceShutdown(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await closeHttpServer();
    await stopWorkersBootstrap();
    await closeInfrastructureResources();

    logger.info("✅ Graceful shutdown finalizado com sucesso");
    forceShutdown(0);
  } catch (error) {
    logger.error(
      {
        error: formatError(error),
      },
      "❌ Erro durante graceful shutdown"
    );

    forceShutdown(1);
  }
}

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM").catch((error) => {
    logger.error({ error: formatError(error) }, "[index] Falha ao processar SIGTERM");
    forceShutdown(1);
  });
});

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT").catch((error) => {
    logger.error({ error: formatError(error) }, "[index] Falha ao processar SIGINT");
    forceShutdown(1);
  });
});

/* =====================================================
   STARTUP STEPS
===================================================== */

async function runStartupMigrations() {
  if (!RUN_MIGRATIONS) {
    logger.warn("⏭️ RUN_MIGRATIONS=false → migrations ignoradas.");
    return;
  }

  logger.info("🔧 Rodando migrations...");
  await runMigrations();
  logger.info("✅ Migrations concluídas.");
}

async function createAndListenHttpServer() {
  server = http.createServer(app);

  server.on("error", (error) => {
    logger.error(
      {
        error: formatError(error),
      },
      "❌ Erro no servidor HTTP"
    );

    gracefulShutdown("server_error").catch(() => {
      forceShutdown(1);
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(PORT, HOST, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });

  logger.info(
    {
      host: HOST,
      port: PORT,
      env: NODE_ENV,
    },
    "🚗 API rodando"
  );
}

async function runStartupWorkers() {
  if (!RUN_WORKERS) {
    logger.info("🧊 RUN_WORKERS=false → bootstrap de workers ignorado");
    return;
  }

  const summary = await startWorkersBootstrap();

  logger.info(
    {
      workers: {
        total: summary.total,
        enabled: summary.enabled,
        successful: summary.successful,
        failed: summary.failed,
      },
    },
    "🤖 Bootstrap de workers concluído"
  );
}

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
  try {
    logger.info(
      {
        env: NODE_ENV,
        host: HOST,
        port: PORT,
        runMigrations: RUN_MIGRATIONS,
        runWorkers: RUN_WORKERS,
        shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
      },
      "🚀 Inicializando aplicação"
    );

    await runStartupMigrations();
    await createAndListenHttpServer();
    await runStartupWorkers();
  } catch (error) {
    logger.error(
      {
        error: formatError(error),
      },
      "❌ Falha ao iniciar aplicação"
    );

    await gracefulShutdown("startup_failure");
  }
}

/* =====================================================
   BOOT
===================================================== */

startServer().catch((error) => {
  logger.error(
    {
      error: formatError(error),
    },
    "❌ Erro fatal no boot"
  );

  forceShutdown(1);
});
