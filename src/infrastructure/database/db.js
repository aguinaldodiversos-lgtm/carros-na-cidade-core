import "dotenv/config";
import { Pool } from "pg";
import { logger } from "../../shared/logger.js";
import { getPoolConfig } from "./pool-config.js";

export const pool = new Pool(getPoolConfig());
export { getPoolConfig };

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
