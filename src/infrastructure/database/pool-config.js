/**
 * Configuração compartilhada do pool PostgreSQL.
 * Usado pelo app principal e workers para garantir consistência e escalabilidade.
 */
import { getDbSslConfig, env } from "../../config/env.js";

export function getPoolConfig(overrides = {}) {
  return {
    connectionString: env.DATABASE_URL,
    ssl: getDbSslConfig(),
    max: env.PG_POOL_MAX,
    idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.PG_CONN_TIMEOUT_MS,
    keepAlive: true,
    application_name: env.SERVICE_NAME,
    ...overrides,
  };
}
