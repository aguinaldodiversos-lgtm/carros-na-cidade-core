import "dotenv/config";
import { Pool } from "pg";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { getPoolConfig } from "./pool-config.js";

function getQueryPreview(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

export const pool = new Pool(getPoolConfig());

pool.on("connect", () => {
  logger.debug?.("[db] conexão adquirida pelo pool");
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

    if (durationMs >= env.PG_SLOW_QUERY_MS) {
      logger.warn(
        {
          durationMs,
          text: getQueryPreview(text),
        },
        "[db] slow query"
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        error: error?.message || String(error),
        text: getQueryPreview(text),
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
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logger.error(
        { error: rollbackError?.message || String(rollbackError) },
        "[db] rollback falhou"
      );
    }

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
  try {
    await pool.end();
    logger.info("[db] pool encerrado");
  } catch (error) {
    logger.error(
      { error: error?.message || String(error) },
      "[db] falha ao encerrar pool"
    );
    throw error;
  }
}

export default pool;
export { getPoolConfig };
