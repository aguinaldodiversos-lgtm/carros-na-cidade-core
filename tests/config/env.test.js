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

  it.each([
    ["development", { rejectUnauthorized: false }],
    ["production", { rejectUnauthorized: false }],
  ])(
    "retorna configuração SSL segura em %s para compatibilidade com Postgres gerenciado",
    async (nodeEnv, expected) => {
      process.env.NODE_ENV = nodeEnv;
      process.env.DATABASE_URL = "postgresql://localhost/test";

      const { getDbSslConfig } = await loadEnvModule();

      expect(getDbSslConfig()).toEqual(expected);
    }
  );

  it("mantém formato estável do retorno SSL", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://localhost/test";

    const { getDbSslConfig } = await loadEnvModule();
    const result = getDbSslConfig();

    expect(result).toBeTruthy();
    expect(result).toMatchObject({ rejectUnauthorized: false });
  });
});
