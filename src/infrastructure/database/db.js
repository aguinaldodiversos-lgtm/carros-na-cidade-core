import { Pool } from "pg";
import { logger } from "../../shared/logger.js";

const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || "development";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const isProduction = NODE_ENV === "production";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000),
  keepAlive: true,
  application_name: process.env.SERVICE_NAME || "carros-na-cidade-core",
});

pool.on("error", (error) => {
  logger.error(
    { error: error?.message || String(error) },
    "[db] erro inesperado no pool"
  );
});

export async function query(text, params = []) {
  const startedAt = Date.now();

  try {
    const result = await pool.query(text, params);
    const durationMs = Date.now() - startedAt;
    const slowMs = Number(process.env.PG_SLOW_QUERY_MS || 800);

    if (durationMs >= slowMs) {
      logger.warn(
        {
          durationMs,
          text: text.slice(0, 240),
        },
        "[db] slow query"
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        error: error?.message || String(error),
        text: text.slice(0, 240),
      },
      "[db] query falhou"
    );
    throw error;
  }
}

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function healthcheck() {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    return result.rows?.[0]?.ok === 1;
  } catch (error) {
    logger.error(
      { error: error?.message || String(error) },
      "[db] healthcheck falhou"
    );
    return false;
  }
}

export async function closeDatabasePool() {
  await pool.end();
  logger.info("[db] pool encerrado");
}

export default {
  pool,
  query,
  withTransaction,
  healthcheck,
  closeDatabasePool,
};
