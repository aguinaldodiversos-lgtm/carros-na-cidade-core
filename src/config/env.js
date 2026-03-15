/**
 * Configuração centralizada e validação de variáveis de ambiente.
 * Garante que o app só inicie com config válida.
 */
import { z } from "zod";

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
  PG_SSL_REJECT_UNAUTHORIZED: z
    .string()
    .transform((v) => v !== "false" && v !== "0")
    .default("true"),

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
  const isProd = env.NODE_ENV === "production";
  if (!isProd) return false;
  return {
    rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED,
  };
}
