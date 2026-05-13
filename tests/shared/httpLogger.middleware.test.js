import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  isIgnoredAuditPath,
  shouldPersistAuditLog,
  __TEST__,
} from "../../src/shared/middlewares/httpLogger.middleware.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("isIgnoredAuditPath", () => {
  const ignored = [
    "/health",
    "/healthz",
    "/health/db",
    "/ready",
    "/live",
    "/ping",
    "/metrics",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/sitemap-cars.xml",
    "/uploads",
    "/uploads/foo/bar.jpg",
    "/api/vehicle-images",
    "/api/vehicle-images/123",
    "/api/vehicle-images/abc/def",
    "/static/app.js",
    "/assets/logo.svg",
    "/images/hero.webp",
    "/img/x.png",
    "/_next/static/chunks/main.js",
    "/anything/file.png",
    "/anything/file.jpg",
    "/anything/file.jpeg",
    "/anything/file.webp",
    "/anything/file.svg",
    "/anything/file.css",
    "/anything/file.js?v=1",
    "/anything/file.map",
    "/anything/file.woff2",
    "/anything/file.mp4",
  ];

  for (const path of ignored) {
    it(`ignores ${path}`, () => {
      expect(isIgnoredAuditPath(path)).toBe(true);
    });
  }

  const persisted = [
    "/api/ads",
    "/api/ads/123",
    "/api/auth/login",
    "/api/users/me",
    "/api/cities",
    "/",
    "/comprar",
    "/comprar/sp/sao-paulo",
  ];

  for (const path of persisted) {
    it(`does NOT ignore ${path}`, () => {
      expect(isIgnoredAuditPath(path)).toBe(false);
    });
  }

  it("treats null/empty path as ignored (safe default)", () => {
    expect(isIgnoredAuditPath(null)).toBe(true);
    expect(isIgnoredAuditPath("")).toBe(true);
  });
});

describe("shouldPersistAuditLog", () => {
  const base = {
    featureEnabled: true,
    method: "GET",
    path: "/api/ads",
    statusCode: 200,
    sampleRate: 0.01,
    rng: () => 0, // amostra abaixo do threshold -> grava
  };

  it("returns false when feature flag is OFF, regardless of anything else", () => {
    expect(
      shouldPersistAuditLog({ ...base, featureEnabled: false, statusCode: 500 })
    ).toBe(false);
  });

  it("returns false for OPTIONS even on a valid path", () => {
    expect(shouldPersistAuditLog({ ...base, method: "OPTIONS" })).toBe(false);
  });

  it("returns false for ignored paths even with status 500", () => {
    for (const path of [
      "/health",
      "/uploads/file.jpg",
      "/api/vehicle-images/42",
      "/_next/static/x.js",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/assets/main.css",
    ]) {
      expect(
        shouldPersistAuditLog({ ...base, path, statusCode: 500 }),
        `expected ${path} not to be persisted`
      ).toBe(false);
    }
  });

  it("returns true for 4xx on a valid path (always persisted)", () => {
    expect(shouldPersistAuditLog({ ...base, statusCode: 404, rng: () => 0.99 })).toBe(true);
  });

  it("returns true for 5xx on a valid path (always persisted)", () => {
    expect(shouldPersistAuditLog({ ...base, statusCode: 503, rng: () => 0.99 })).toBe(true);
  });

  it("samples 2xx: persists when rng < sampleRate", () => {
    expect(
      shouldPersistAuditLog({ ...base, statusCode: 200, sampleRate: 0.01, rng: () => 0.005 })
    ).toBe(true);
  });

  it("samples 2xx: drops when rng >= sampleRate", () => {
    expect(
      shouldPersistAuditLog({ ...base, statusCode: 200, sampleRate: 0.01, rng: () => 0.5 })
    ).toBe(false);
  });

  it("samples 3xx like 2xx", () => {
    expect(
      shouldPersistAuditLog({ ...base, statusCode: 301, sampleRate: 0.01, rng: () => 0.005 })
    ).toBe(true);
    expect(
      shouldPersistAuditLog({ ...base, statusCode: 301, sampleRate: 0.01, rng: () => 0.5 })
    ).toBe(false);
  });

  it("sampleRate=0 drops all 2xx/3xx", () => {
    // rng < 0 é sempre falso -> nunca grava
    expect(
      shouldPersistAuditLog({ ...base, statusCode: 200, sampleRate: 0, rng: () => 0 })
    ).toBe(false);
  });

  it("sampleRate=1 keeps all 2xx/3xx", () => {
    expect(
      shouldPersistAuditLog({ ...base, statusCode: 200, sampleRate: 1, rng: () => 0.999999 })
    ).toBe(true);
  });

  it("statistical sanity: ~1% sampling of 2xx over 10k draws", () => {
    let kept = 0;
    const N = 10_000;
    // RNG determinístico (linear congruencial simples) pra estabilidade do teste.
    let seed = 42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < N; i++) {
      if (
        shouldPersistAuditLog({
          featureEnabled: true,
          method: "GET",
          path: "/api/ads",
          statusCode: 200,
          sampleRate: 0.01,
          rng,
        })
      ) {
        kept++;
      }
    }
    // Esperamos ~100. Tolerância folgada pra não ser flaky.
    expect(kept).toBeGreaterThan(50);
    expect(kept).toBeLessThan(200);
  });
});

describe("truncate helper", () => {
  const { truncate, MAX_PATH_LEN, MAX_UA_LEN } = __TEST__;

  it("returns null for nullish", () => {
    expect(truncate(null, 10)).toBeNull();
    expect(truncate(undefined, 10)).toBeNull();
  });

  it("does not modify short strings", () => {
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("truncates long strings", () => {
    expect(truncate("a".repeat(20), 5)).toBe("aaaaa");
  });

  it("enforces declared path/UA limits", () => {
    expect(MAX_PATH_LEN).toBe(512);
    expect(MAX_UA_LEN).toBe(256);
  });
});

describe("features.requestAuditLogs default (env ausente)", () => {
  // Spawn de Node sem REQUEST_AUDIT_LOGS_ENABLED no env: a única forma honesta
  // de verificar o default — vitest já carregou features.js com o env atual.
  function runWithEnv(envOverrides) {
    const env = { ...process.env };
    delete env.REQUEST_AUDIT_LOGS_ENABLED;
    Object.assign(env, envOverrides);
    const featuresPath = path.join(REPO_ROOT, "src", "shared", "config", "features.js").replace(/\\/g, "/");
    const code = `
      import("file:///${featuresPath}").then(m => {
        process.stdout.write(JSON.stringify({ value: m.features.requestAuditLogs }));
      });
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      env,
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return JSON.parse(out).value;
  }

  it("default é false quando a env não está setada", () => {
    expect(runWithEnv({})).toBe(false);
  });

  it("ligado quando explicitamente true", () => {
    expect(runWithEnv({ REQUEST_AUDIT_LOGS_ENABLED: "true" })).toBe(true);
  });

  it("desligado quando false explícito", () => {
    expect(runWithEnv({ REQUEST_AUDIT_LOGS_ENABLED: "false" })).toBe(false);
  });
});
