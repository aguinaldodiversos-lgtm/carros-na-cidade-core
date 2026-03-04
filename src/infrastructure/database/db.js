// src/infrastructure/database/db.js
import { Pool } from "pg";
import { logger } from "../../shared/logger.js";

const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || "development";

if (!DATABASE_URL) {
  logger.error("❌ DATABASE_URL não definido. Configure no ambiente (Render/Local).");
  throw new Error("DATABASE_URL is required");
}

const isProduction = NODE_ENV === "production";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10_000),
  keepAlive: true,
});

pool.on("error", (err) => {
  logger.error({
    message: "❌ Erro inesperado no pool do Postgres",
    error: err?.message || String(err),
  });
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    const slowMs = Number(process.env.PG_SLOW_QUERY_MS || 800);
    if (duration > slowMs) {
      logger.warn({
        message: "🐢 Query lenta detectada",
        duration_ms: duration,
        text: text?.slice?.(0, 200),
      });
    }

    return res;
  } catch (err) {
    logger.error({
      message: "❌ Erro ao executar query",
      error: err?.message || String(err),
      text: text?.slice?.(0, 200),
    });
    throw err;
  }
}

export async function healthcheck() {
  try {
    const res = await pool.query("SELECT 1 as ok");
    return res.rows?.[0]?.ok === 1;
  } catch (err) {
    logger.error({
      message: "❌ Healthcheck do banco falhou",
      error: err?.message || String(err),
    });
    return false;
  }
}
