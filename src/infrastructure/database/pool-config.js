/**
 * Configuração compartilhada do pool PostgreSQL.
 * Fonte única de conexão do backend.
 */
import { getDbSslConfig, env } from "../../config/env.js";

function normalizeConnectionString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getPoolConfig(overrides = {}) {
  return {
    connectionString: normalizeConnectionString(env.DATABASE_URL),
    ssl: getDbSslConfig(),
    max: env.PG_POOL_MAX,
    idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.PG_CONN_TIMEOUT_MS,
    keepAlive: true,
    application_name: env.SERVICE_NAME,
    ...overrides,
  };
}
