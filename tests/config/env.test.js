import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

async function loadEnvModule() {
  vi.resetModules();
  return import("../../src/config/env.js");
}

/**
 * Estes testes cobrem o shim `getDbSslConfig` que delega ao helper
 * centralizado `resolveSslConfig` (src/infrastructure/database/ssl-config.js).
 * A regra não depende mais de NODE_ENV: considera override explícito,
 * query string do DATABASE_URL e detecção de host local.
 */
describe("getDbSslConfig (compat via resolveSslConfig)", () => {
  beforeEach(() => {
    restoreEnv();
    // Remove variáveis que podem influenciar a decisão de SSL
    delete process.env.PG_SSL_ENABLED;
    delete process.env.PG_SSL_REJECT_UNAUTHORIZED;
    delete process.env.PG_SSL_MODE;
    delete process.env.PGSSLMODE;
    delete process.env.PGSSL;
  });

  afterEach(() => {
    restoreEnv();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("desliga SSL por padrão para host local (sem override)", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });

  it("liga SSL para host remoto por padrão", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com:5432/app_db";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it("respeita sslmode=require na query string mesmo em host local", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/app?sslmode=require";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it("respeita sslmode=disable na query string mesmo em host remoto", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com/app?sslmode=disable";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });

  it("desliga SSL quando PG_SSL_ENABLED=false explicitamente", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com/app";
    process.env.PG_SSL_ENABLED = "false";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });

  it("PG_SSL_ENABLED=true NÃO força SSL em host local (usar PG_SSL_MODE=require para forçar)", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/app";
    process.env.PG_SSL_ENABLED = "true";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });

  it("PG_SSL_MODE=require força SSL mesmo em host local", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/app";
    process.env.PG_SSL_MODE = "require";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it("PG_SSL_MODE=disable vence qualquer outra config", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com/app?sslmode=require";
    process.env.PG_SSL_ENABLED = "true";
    process.env.PG_SSL_MODE = "disable";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });

  it("permite controlar rejectUnauthorized via PG_SSL_REJECT_UNAUTHORIZED", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com/app";
    process.env.PG_SSL_REJECT_UNAUTHORIZED = "true";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: true });
  });

  it("desliga SSL para alias de service container (host 'postgres')", async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@postgres:5432/app";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });

  it("rejeita carregamento do módulo quando DATABASE_URL está ausente", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;

    await expect(loadEnvModule()).rejects.toThrow(/DATABASE_URL/i);
  });
});
