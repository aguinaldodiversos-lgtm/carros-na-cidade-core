import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBackendApiBaseUrl, getBackendApiExplicitEnvUrl, resolveBackendApiUrl } from "./backend-api";

const keys = ["AUTH_API_BASE_URL", "BACKEND_API_URL", "API_URL", "NEXT_PUBLIC_API_URL"] as const;

/** `process.env` é readonly no TS; testes precisam de um registro mutável. */
function envRecord() {
  return process.env as Record<string, string | undefined>;
}

function clearBackendEnv() {
  const env = envRecord();
  for (const k of keys) {
    delete env[k];
  }
}

describe("backend-api", () => {
  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};
  let nodeEnvSnapshot: string | undefined;

  beforeEach(() => {
    nodeEnvSnapshot = process.env.NODE_ENV;
    for (const k of keys) {
      snapshot[k] = process.env[k];
    }
    clearBackendEnv();
  });

  afterEach(() => {
    clearBackendEnv();
    const env = envRecord();
    for (const k of keys) {
      const v = snapshot[k];
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    if (nodeEnvSnapshot === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = nodeEnvSnapshot;
  });

  it("getBackendApiBaseUrl usa fallback de produção sem variáveis", () => {
    envRecord().NODE_ENV = "production";
    expect(getBackendApiBaseUrl()).toBe("https://carros-na-cidade-core.onrender.com");
  });

  it("getBackendApiBaseUrl usa fallback local em dev sem variáveis", () => {
    envRecord().NODE_ENV = "development";
    expect(getBackendApiBaseUrl()).toBe("http://127.0.0.1:4000");
  });

  it("getBackendApiBaseUrl prioriza AUTH_API_BASE_URL e remove barra final", () => {
    const env = envRecord();
    env.BACKEND_API_URL = "http://old.example.com";
    env.AUTH_API_BASE_URL = "https://api.example.com/";
    expect(getBackendApiBaseUrl()).toBe("https://api.example.com");
  });

  it("getBackendApiExplicitEnvUrl segue a mesma prioridade e não usa fallback localhost", () => {
    envRecord().NODE_ENV = "development";
    expect(getBackendApiExplicitEnvUrl()).toBe("");
    envRecord().BACKEND_API_URL = "https://core.example.com/";
    expect(getBackendApiExplicitEnvUrl()).toBe("https://core.example.com");
  });

  it("resolveBackendApiUrl usa fallback de produção sem env vars", () => {
    envRecord().NODE_ENV = "production";
    expect(resolveBackendApiUrl("/api/auth/login")).toBe(
      "https://carros-na-cidade-core.onrender.com/api/auth/login"
    );
  });

  it("resolveBackendApiUrl concatena base + path /api/...", () => {
    envRecord().NEXT_PUBLIC_API_URL = "http://127.0.0.1:4000";
    expect(resolveBackendApiUrl("/api/auth/login")).toBe("http://127.0.0.1:4000/api/auth/login");
  });

  it("resolveBackendApiUrl: base terminando em /api deduplica /api no path", () => {
    envRecord().API_URL = "https://render.example.com/api";
    expect(resolveBackendApiUrl("/api/auth/me")).toBe("https://render.example.com/api/auth/me");
  });
});
