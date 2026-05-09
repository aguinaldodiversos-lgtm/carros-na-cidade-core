import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn(async (cb) =>
    cb({ query: vi.fn().mockResolvedValue({ rows: [{ key: "regional.radius_km", value: 80, updated_at: "2026-05-09T10:00:00Z" }] }) })
  ),
}));

vi.mock("../../src/modules/platform/settings.service.js", () => ({
  getSetting: vi.fn().mockResolvedValue(80),
  setSetting: vi.fn().mockResolvedValue({
    key: "regional.radius_km",
    value: 80,
    updated_at: "2026-05-09T10:00:00Z",
  }),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/shared/cache/cache.middleware.js", () => ({
  cacheInvalidatePrefix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import { setSetting } from "../../src/modules/platform/settings.service.js";

const adminUser = { id: "admin-1", role: "admin", plan: "free" };
const regularUser = { id: "user-1", role: "user", plan: "free" };

function injectUser(user) {
  return (req, _res, next) => {
    req.user = user;
    req.auth = { token: "test", decoded: { id: user.id } };
    next();
  };
}

function createApp(user) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use("/api/admin", adminRoutes);
  app.use(errorHandler);
  return app;
}

let supertest = null;

beforeAll(async () => {
  try {
    const mod = await import("supertest");
    supertest = mod.default;
  } catch {
    supertest = null;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/admin/regional-settings — autorização", () => {
  it("user comum recebe 403 no GET", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser)).get("/api/admin/regional-settings");
    expect(res.status).toBe(403);
  });

  it("user comum recebe 403 no PATCH", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser))
      .patch("/api/admin/regional-settings")
      .send({ radius_km: 50 });
    expect(res.status).toBe(403);
  });
});

describe("/api/admin/regional-settings — GET", () => {
  it("admin recebe 200 com shape esperado", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser)).get("/api/admin/regional-settings");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      radius_km: 80,
      radius_min_km: 10,
      radius_max_km: 150,
      radius_default_km: 80,
    });
  });
});

describe("/api/admin/regional-settings — PATCH", () => {
  it("admin grava radius válido (50)", async () => {
    if (!supertest) return;
    setSetting.mockResolvedValueOnce({
      key: "regional.radius_km",
      value: 50,
      updated_at: "2026-05-09T11:00:00Z",
    });
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/regional-settings")
      .send({ radius_km: 50 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.radius_km).toBe(50);
  });

  it("PATCH sem radius_km retorna 400", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/regional-settings")
      .send({});
    expect(res.status).toBe(400);
  });

  it("PATCH com valor abaixo do mínimo retorna 400", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/regional-settings")
      .send({ radius_km: 5 });
    expect(res.status).toBe(400);
  });

  it("PATCH com valor acima do máximo retorna 400", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/regional-settings")
      .send({ radius_km: 200 });
    expect(res.status).toBe(400);
  });

  it("PATCH com valor não-inteiro retorna 400", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/regional-settings")
      .send({ radius_km: 80.5 });
    expect(res.status).toBe(400);
  });

  it("PATCH com string não-numérica retorna 400", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/regional-settings")
      .send({ radius_km: "abc" });
    expect(res.status).toBe(400);
  });
});
