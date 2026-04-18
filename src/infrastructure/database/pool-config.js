/**
 * Configuração compartilhada do pool PostgreSQL.
 * Fonte única de conexão do backend.
 */
import { env } from "../../config/env.js";
import { resolveSslConfig } from "./ssl-config.js";

function normalizeConnectionString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getPoolConfig(overrides = {}) {
  const connectionString = normalizeConnectionString(env.DATABASE_URL);
  return {
    connectionString,
    ssl: resolveSslConfig(connectionString, process.env),
    max: env.PG_POOL_MAX,
    idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.PG_CONN_TIMEOUT_MS,
    keepAlive: true,
    application_name: env.SERVICE_NAME,
    ...overrides,
  };
}
