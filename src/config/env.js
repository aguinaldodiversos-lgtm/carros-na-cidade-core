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

  // JWT — obrigatórios em produção; em dev admite valor curto (mas não vazio)
  JWT_SECRET: z
    .string()
    .min(1, "JWT_SECRET é obrigatório")
    .refine(
      (v) => process.env.NODE_ENV !== "production" || v.length >= 32,
      "JWT_SECRET deve ter ao menos 32 caracteres em produção"
    ),
  JWT_REFRESH_SECRET: z
    .string()
    .min(1, "JWT_REFRESH_SECRET é obrigatório")
    .refine(
      (v) => process.env.NODE_ENV !== "production" || v.length >= 32,
      "JWT_REFRESH_SECRET deve ter ao menos 32 caracteres em produção"
    ),

  // MercadoPago (opcional – desabilita checkout real quando ausente)
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_PUBLIC_KEY: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),

  // URL pública do backend (usada em notificações/webhook)
  APP_BASE_URL: z.string().url().optional(),

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
  const isProduction = env.NODE_ENV === "production";

  if (!isProduction) return false;
  if (!env.PG_SSL_ENABLED) return false;

  return {
    rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED,
  };
}
