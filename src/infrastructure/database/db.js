// Side-effect import: carrega dotenv OPCIONALMENTE antes de env.js avaliar
// `parseEnv()`. Em ESM, imports rodam na ordem em que aparecem; portanto
// este DEVE permanecer como o primeiro import do módulo. Ver
// _load-dotenv-optional.js para a justificativa completa.
import "./_load-dotenv-optional.js";

import { Pool } from "pg";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { getPoolConfig } from "./pool-config.js";

const pool = new Pool(getPoolConfig());

let isPoolClosing = false;

function getQueryPreview(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function normalizeParams(params) {
  if (Array.isArray(params)) return params;
  if (params == null) return [];
  return [params];
}

function getQueryMeta(text, params) {
  return {
    text: getQueryPreview(text),
    paramCount: normalizeParams(params).length,
  };
}

function logPoolEvent(level, payload, message) {
  const fn =
    level === "error"
      ? logger.error
      : level === "warn"
        ? logger.warn
        : level === "info"
          ? logger.info
          : logger.debug;

  if (typeof fn === "function") {
    fn.call(logger, payload, message);
  }
}

function createInstrumentedQueryExecutor(queryable, source = "pool") {
  return async function instrumentedQuery(text, params = []) {
    const normalizedParams = normalizeParams(params);
    const startedAt = Date.now();

    try {
      const result = await queryable.query(text, normalizedParams);
      const durationMs = Date.now() - startedAt;

      if (durationMs >= env.PG_SLOW_QUERY_MS) {
        logPoolEvent(
          "warn",
          {
            source,
            durationMs,
            ...getQueryMeta(text, normalizedParams),
          },
          "[db] slow query"
        );
      }

      return result;
    } catch (error) {
      logPoolEvent(
        "error",
        {
          source,
          error: error?.message || String(error),
          ...getQueryMeta(text, normalizedParams),
        },
        "[db] query falhou"
      );
      throw error;
    }
  };
}

pool.on("connect", () => {
  logPoolEvent(
    "debug",
    {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    },
    "[db] conexão adquirida pelo pool"
  );
});

pool.on("error", (error) => {
  logPoolEvent(
    "error",
    {
      error: error?.message || String(error),
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    },
    "[db] erro inesperado no pool"
  );
});

const pooledQuery = createInstrumentedQueryExecutor(pool, "pool");

export { pool };

export async function query(text, params = []) {
  return pooledQuery(text, params);
}

export async function getClient() {
  const client = await pool.connect();
  const clientQuery = createInstrumentedQueryExecutor(client, "transaction");

  return {
    raw: client,
    query: clientQuery,
    release() {
      client.release();
    },
  };
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  const txQuery = createInstrumentedQueryExecutor(client, "transaction");

  try {
    await client.query("BEGIN");

    const transactionApi = {
      raw: client,
      query: txQuery,
    };

    const result = await callback(transactionApi);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logPoolEvent(
        "error",
        {
          error: rollbackError?.message || String(rollbackError),
        },
        "[db] rollback falhou"
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Transação autenticada: define `app.current_user_id` via `set_config` para que
 * as políticas de RLS na tabela `ads` possam verificar o proprietário no banco.
 * O parâmetro `true` em set_config limita o valor ao escopo da transação (SET LOCAL).
 */
export async function withUserTransaction(userId, callback) {
  const client = await pool.connect();
  const txQuery = createInstrumentedQueryExecutor(client, "transaction");

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);

    const transactionApi = {
      raw: client,
      query: txQuery,
    };

    const result = await callback(transactionApi);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logPoolEvent(
        "error",
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
    logPoolEvent(
      "error",
      {
        error: error?.message || String(error),
      },
      "[db] healthcheck falhou"
    );
    return false;
  }
}

export async function closeDatabasePool() {
  if (isPoolClosing) return;

  isPoolClosing = true;

  try {
    await pool.end();
    logPoolEvent("info", {}, "[db] pool encerrado");
  } catch (error) {
    isPoolClosing = false;
    logPoolEvent(
      "error",
      {
        error: error?.message || String(error),
      },
      "[db] falha ao encerrar pool"
    );
    throw error;
  }
}

export default pool;
export { getPoolConfig };
