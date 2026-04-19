/**
 * Configuração centralizada e validação de variáveis de ambiente.
 * Base única para app, workers, migrations e integrações.
 */
import { z } from "zod";
import { resolveSslConfig } from "../infrastructure/database/ssl-config.js";

function coerceBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;

  return defaultValue;
}

const booleanField = (defaultValue = false) =>
  z.preprocess((value) => coerceBoolean(value, defaultValue), z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  PG_POOL_MAX: z.coerce.number().min(1).max(100).default(20),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().min(1000).default(30000),
  PG_CONN_TIMEOUT_MS: z.coerce.number().min(1000).default(10000),
  PG_SLOW_QUERY_MS: z.coerce.number().min(100).default(800),
  PG_SSL_ENABLED: booleanField(true).default(true),
  PG_SSL_REJECT_UNAUTHORIZED: booleanField(false).default(false),

  // Redis
  REDIS_URL: z.string().optional(),

  // JWT (opcional em dev)
  JWT_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),

  // Service
  SERVICE_NAME: z.string().default("carros-na-cidade-core"),
});

function parseEnv() {
  // Contexto de teste (NODE_ENV=test explicitamente): env.js é carregado
  // transitivamente durante o bootstrap do vitest.config (brain-stack → ai.audit
  // → db → env), antes do `integration-db-bootstrap.js` rodar. Jobs que não
  // usam banco (ex.: Backend unit tests com integração excluída) não definem
  // DATABASE_URL — um placeholder seguro aqui evita quebrar a carga do módulo.
  // Produção (NODE_ENV=production) e development permanecem estritos.
  // O gate usa NODE_ENV==="test" explicitamente (e não VITEST) para não
  // mascarar o teste que valida esse fail-fast em cenário development.
  if (process.env.NODE_ENV === "test" && !String(process.env.DATABASE_URL || "").trim()) {
    process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test_placeholder";
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`[config] Variáveis de ambiente inválidas:\n${issues.join("\n")}`);
  }

  return result.data;
}

export const env = parseEnv();

/**
 * Compat: delega ao helper centralizado em infrastructure/database/ssl-config.js.
 * Mantido para não quebrar importações existentes. A regra de decisão não
 * depende mais de NODE_ENV — considera host local, overrides explícitos e
 * query string do DATABASE_URL.
 */
export function getDbSslConfig() {
  return resolveSslConfig(env.DATABASE_URL, process.env);
}
