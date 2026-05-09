import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Garante que /health expõe o schema readiness check da migration 025
 * e que, em production, schema ausente derruba o healthcheck para 503
 * (Render marca instance unhealthy → não promove a release nova).
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  healthcheck: vi.fn(async () => true),
}));

vi.mock("../../src/infrastructure/database/schema-readiness.js", () => ({
  checkAntifraudSchema: vi.fn(),
}));

vi.mock("../../src/infrastructure/cache/redis.js", () => ({
  redis: null,
}));

const schema = await import("../../src/infrastructure/database/schema-readiness.js");
const healthMod = await import("../../src/routes/health.js");

function buildApp() {
  const app = express();
  app.use("/", healthMod.default);
  return app;
}

beforeEach(() => {
  schema.checkAntifraudSchema.mockReset();
  healthMod.__resetHealthSchemaCacheForTests();
});

describe("/health — antifraud schema readiness", () => {
  it("schema OK em production → 200 e antifraud_schema='ok'", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    schema.checkAntifraudSchema.mockResolvedValue({
      ok: true,
      missingColumns: [],
      missingTables: [],
      checkedAt: "2026-05-09T00:00:00Z",
    });

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.checks.antifraud_schema).toBe("ok");
    expect(res.body.checks.antifraud_schema_missing).toBeUndefined();
    expect(res.body.ok).toBe(true);

    process.env.NODE_ENV = prevEnv;
  });

  it("schema MISSING em production → 503 e detalhes do que falta", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    schema.checkAntifraudSchema.mockResolvedValue({
      ok: false,
      missingColumns: ["risk_score", "risk_level"],
      missingTables: ["ad_moderation_events"],
      checkedAt: "2026-05-09T00:00:00Z",
    });

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.checks.antifraud_schema).toBe("missing");
    expect(res.body.checks.antifraud_schema_missing).toEqual({
      columns: ["risk_score", "risk_level"],
      tables: ["ad_moderation_events"],
    });
    expect(res.body.ok).toBe(false);
    expect(res.body.status).toBe("degraded");

    process.env.NODE_ENV = prevEnv;
  });

  it("schema MISSING em staging → 503 (mesmo guard de production)", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "staging";
    schema.checkAntifraudSchema.mockResolvedValue({
      ok: false,
      missingColumns: ["risk_score"],
      missingTables: [],
      checkedAt: "2026-05-09T00:00:00Z",
    });

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.checks.antifraud_schema).toBe("missing");

    process.env.NODE_ENV = prevEnv;
  });

  it("schema MISSING em development → 200 (warning, não derruba dev)", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    schema.checkAntifraudSchema.mockResolvedValue({
      ok: false,
      missingColumns: ["risk_score"],
      missingTables: ["ad_moderation_events"],
      checkedAt: "2026-05-09T00:00:00Z",
    });

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.checks.antifraud_schema).toBe("missing");
    // Mas o status agregado segue ok porque dev/test não bloqueia.
    expect(res.body.ok).toBe(true);

    process.env.NODE_ENV = prevEnv;
  });

  it("erro na consulta do schema NÃO crasha o /health (retorna missing)", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    schema.checkAntifraudSchema.mockRejectedValue(new Error("connection refused"));

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.checks.antifraud_schema).toBe("missing");

    process.env.NODE_ENV = prevEnv;
  });
});
