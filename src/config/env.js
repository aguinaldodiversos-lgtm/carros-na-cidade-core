/**
 * Configuração centralizada e validação de variáveis de ambiente.
 * Base única para app, workers, migrations e integrações.
 */
import { z } from "zod";

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
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`[config] Variáveis de ambiente inválidas:\n${issues.join("\n")}`);
  }

  return result.data;
}

export const env = parseEnv();

export function getDbSslConfig() {
  const explicitSslConfig =
    coerceBoolean(process.env.PG_SSL_ENABLED, false) ||
    /\bsslmode=(require|prefer|verify-ca|verify-full)\b/i.test(env.DATABASE_URL) ||
    /\bssl=true\b/i.test(env.DATABASE_URL);

  if (env.NODE_ENV !== "production" && !explicitSslConfig) return false;
  if (!env.PG_SSL_ENABLED) return false;

  return {
    rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED,
  };
}
