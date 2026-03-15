import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getDbSslConfig", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("retorna false em development", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    const { getDbSslConfig } = await import("../../src/config/env.js");
    expect(getDbSslConfig()).toBe(false);
  });

  it("retorna rejectUnauthorized true em production por padrão", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://localhost/test";
    const { getDbSslConfig } = await import("../../src/config/env.js");
    expect(getDbSslConfig()).toEqual({ rejectUnauthorized: true });
  });
});
