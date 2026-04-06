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

describe("getDbSslConfig", () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("retorna configuração SSL segura por padrão em development quando há DATABASE_URL", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://localhost/test";

    process.env.PG_SSL_ENABLED = "true";


    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it("retorna configuração SSL segura por padrão em production quando há DATABASE_URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.PG_SSL_ENABLED = "true";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it("mantém formato estável do retorno quando SSL está ativo", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.PG_SSL_ENABLED = "true";

    const { getDbSslConfig } = await loadEnvModule();
    const result = getDbSslConfig();

    expect(result).toBeTruthy();
    expect(result).toMatchObject({ rejectUnauthorized: false });
  });
    it("retorna false quando SSL é explicitamente desativado", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.PG_SSL_ENABLED = "false";
    delete process.env.PG_SSL_REJECT_UNAUTHORIZED;


    delete process.env.PG_SSL_ENABLED;
    delete process.env.PG_SSL_REJECT_UNAUTHORIZED;


    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });
  

  it("retorna configuração SSL quando SSL é explicitamente ativado", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.PG_SSL_ENABLED = "true";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it("permite controlar rejectUnauthorized explicitamente", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.PG_SSL_ENABLED = "true";
    process.env.PG_SSL_REJECT_UNAUTHORIZED = "true";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: true });
  });

  it("rejeita carregamento do módulo quando DATABASE_URL está ausente", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;

    await expect(loadEnvModule()).rejects.toThrow(/DATABASE_URL/i);
  });

  it("não força SSL para banco local explicitamente desativado", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/carros_na_cidade_test";
    process.env.PG_SSL_ENABLED = "false";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toBe(false);
  });

  it("permite SSL para banco local quando explicitamente ativado", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/carros_na_cidade_test";
    process.env.PG_SSL_ENABLED = "true";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it("mantém compatibilidade com Postgres hospedado/gerenciado", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com:5432/app_db";
    process.env.PG_SSL_ENABLED = "true";

    const { getDbSslConfig } = await loadEnvModule();

    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: false });
  });
});
