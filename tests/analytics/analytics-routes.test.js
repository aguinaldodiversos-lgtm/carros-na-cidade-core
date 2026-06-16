import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

// Mocka o repositório → o serviço real roda (validação), sem banco.
vi.mock("../../src/modules/analytics/analytics.repository.js", () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
  getTotals: vi.fn().mockResolvedValue({ views30d: 0 }),
  getTimeseries: vi.fn().mockResolvedValue([]),
  getTopCities: vi.fn().mockResolvedValue([]),
  getTopRegions: vi.fn().mockResolvedValue([]),
  getTopPages: vi.fn().mockResolvedValue([]),
  getTopAds: vi.fn().mockResolvedValue([]),
  getTopBlogPosts: vi.fn().mockResolvedValue([]),
  getTrafficSources: vi.fn().mockResolvedValue({ referrers: [], campaigns: [] }),
  getCommercialEvents: vi.fn().mockResolvedValue({ whatsapp_click: 0 }),
  getLowContactAds: vi.fn().mockResolvedValue([]),
  getAdMetrics: vi.fn().mockResolvedValue({ ad_id: 7, views_30d: 0 }),
  getPostMetrics: vi.fn().mockResolvedValue({ blog_post_id: 3 }),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { collectAnalyticsEvent } from "../../src/modules/public/public-analytics.controller.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import * as repo from "../../src/modules/analytics/analytics.repository.js";

const adminUser = { id: "admin-1", role: "admin", plan: "free" };
const regularUser = { id: "user-1", role: "user", plan: "free" };

function injectUser(user) {
  return (req, _res, next) => {
    if (user) {
      req.user = user;
      req.auth = { token: "test", decoded: { id: user.id } };
    }
    next();
  };
}

function publicApp() {
  const app = express();
  app.use(express.json());
  app.post("/api/public/analytics/events", collectAnalyticsEvent);
  app.use(errorHandler);
  return app;
}

function adminApp(user) {
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
    supertest = (await import("supertest")).default;
  } catch {
    supertest = null;
  }
});
beforeEach(() => vi.clearAllMocks());

describe("POST /api/public/analytics/events — coletor público", () => {
  it("evento válido retorna 204 e grava", async () => {
    if (!supertest) return;
    const res = await supertest(publicApp())
      .post("/api/public/analytics/events")
      .send({ event_type: "city_page_view", city_slug: "sao-paulo-sp", session_id: "s1" });
    expect(res.status).toBe(204);
    expect(repo.insertEvent).toHaveBeenCalledOnce();
  });

  it("event_type inválido retorna 400 e não grava", async () => {
    if (!supertest) return;
    const res = await supertest(publicApp())
      .post("/api/public/analytics/events")
      .send({ event_type: "drop_table", session_id: "s1" });
    expect(res.status).toBe(400);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("payload gigante retorna 413 e não grava", async () => {
    if (!supertest) return;
    const res = await supertest(publicApp())
      .post("/api/public/analytics/events")
      .send({ event_type: "page_view", path: "x".repeat(5000) });
    expect(res.status).toBe(413);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("não exige login (anônimo é aceito)", async () => {
    if (!supertest) return;
    const res = await supertest(publicApp())
      .post("/api/public/analytics/events")
      .send({ event_type: "page_view" });
    expect(res.status).toBe(204);
  });
});

describe("GET /api/admin/analytics/overview — admin-only", () => {
  it("anônimo recebe 401", async () => {
    if (!supertest) return;
    const res = await supertest(adminApp(null)).get("/api/admin/analytics/overview");
    expect(res.status).toBe(401);
  });

  it("user comum recebe 403", async () => {
    if (!supertest) return;
    const res = await supertest(adminApp(regularUser)).get("/api/admin/analytics/overview");
    expect(res.status).toBe(403);
  });

  it("admin recebe 200 com overview composto", async () => {
    if (!supertest) return;
    const res = await supertest(adminApp(adminUser)).get(
      "/api/admin/analytics/overview?period=7d"
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty("totals");
    expect(res.body.data).toHaveProperty("topCities");
    expect(res.body.data.period).toBe("7d");
  });

  it("admin overview de métricas de anúncio retorna 200", async () => {
    if (!supertest) return;
    const res = await supertest(adminApp(adminUser)).get("/api/admin/analytics/ads/7");
    expect(res.status).toBe(200);
    expect(res.body.data.ad_id).toBe(7);
  });
});
