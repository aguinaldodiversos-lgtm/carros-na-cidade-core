import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "./backend-api";

const keys = ["AUTH_API_BASE_URL", "BACKEND_API_URL", "API_URL", "NEXT_PUBLIC_API_URL"] as const;

function clearBackendEnv() {
  for (const k of keys) {
    delete process.env[k];
  }
}

describe("backend-api", () => {
  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of keys) {
      snapshot[k] = process.env[k];
    }
    clearBackendEnv();
  });

  afterEach(() => {
    clearBackendEnv();
    for (const k of keys) {
      const v = snapshot[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("getBackendApiBaseUrl retorna string vazia sem variáveis", () => {
    expect(getBackendApiBaseUrl()).toBe("");
  });

  it("getBackendApiBaseUrl prioriza AUTH_API_BASE_URL e remove barra final", () => {
    process.env.BACKEND_API_URL = "http://old.example.com";
    process.env.AUTH_API_BASE_URL = "https://api.example.com/";
    expect(getBackendApiBaseUrl()).toBe("https://api.example.com");
  });

  it("resolveBackendApiUrl retorna vazio sem base", () => {
    expect(resolveBackendApiUrl("/api/auth/login")).toBe("");
  });

  it("resolveBackendApiUrl concatena base + path /api/...", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:4000";
    expect(resolveBackendApiUrl("/api/auth/login")).toBe("http://127.0.0.1:4000/api/auth/login");
  });

  it("resolveBackendApiUrl: base terminando em /api deduplica /api no path", () => {
    process.env.API_URL = "https://render.example.com/api";
    expect(resolveBackendApiUrl("/api/auth/me")).toBe("https://render.example.com/api/auth/me");
  });
});
