// src/infrastructure/database/db.js
import { Pool } from "pg";
import { logger } from "../../shared/logger.js";

const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || "development";

const isProduction = NODE_ENV === "production";

/**
 * Validação crítica de configuração
 */
if (!DATABASE_URL) {
  logger.error({
    message: "DATABASE_URL não definido. Configure a variável de ambiente.",
    env: NODE_ENV,
  });

  throw new Error("DATABASE_URL is required");
}

/**
 * Configuração robusta do pool PostgreSQL
 */
export const pool = new Pool({
  connectionString: DATABASE_URL,

  ssl: isProduction
    ? {
        rejectUnauthorized: false,
      }
    : false,

  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000),

  keepAlive: true,
});

/**
 * Log quando pool conecta
 */
pool.on("connect", () => {
  logger.info({
    message: "PostgreSQL pool conectado",
  });
});

/**
 * Captura erros inesperados no pool
 */
pool.on("error", (err) => {
  logger.error({
    message: "Erro inesperado no pool PostgreSQL",
    error: err?.message || String(err),
  });
});

/**
 * Helper para executar queries com logging e controle de performance
 */
export async function query(text, params = []) {
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    const slowThreshold = Number(process.env.PG_SLOW_QUERY_MS || 800);

    if (duration > slowThreshold) {
      logger.warn({
        message: "Query lenta detectada",
        duration_ms: duration,
        query: text?.slice?.(0, 200),
      });
    }

    return res;
  } catch (err) {
    logger.error({
      message: "Erro ao executar query",
      error: err?.message || String(err),
      query: text?.slice?.(0, 200),
    });

    throw err;
  }
}

/**
 * Healthcheck simples para endpoints /health
 */
export async function healthcheck() {
  try {
    const res = await pool.query("SELECT 1 AS ok");
    return res.rows?.[0]?.ok === 1;
  } catch (err) {
    logger.error({
      message: "Falha no healthcheck do banco",
      error: err?.message || String(err),
    });

    return false;
  }
}
