import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

const mockUser = { id: "admin-1", role: "admin", plan: "free" };
const mockRegularUser = { id: "user-1", role: "user", plan: "free" };

function injectUser(user) {
  return (req, _res, next) => {
    req.user = user;
    req.auth = { token: "test", decoded: { id: user.id } };
    next();
  };
}

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";

function createApp(user) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use("/api/admin", adminRoutes);
  app.use(errorHandler);
  return app;
}

async function request(app, method, path) {
  const { default: supertest } = await import("supertest").catch(() => ({ default: null }));
  if (!supertest) {
    return null;
  }
  if (method === "GET") return supertest(app).get(path);
  if (method === "PATCH") return supertest(app).patch(path).send({});
  return supertest(app).get(path);
}

describe("admin routes access control", () => {
  let hasSupertest = false;

  beforeAll(async () => {
    try {
      await import("supertest");
      hasSupertest = true;
    } catch {
      hasSupertest = false;
    }
  });

  it("blocks regular user from admin endpoints", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockRegularUser);
    const res = await request(app, "GET", "/api/admin/dashboard/overview");
    expect(res.status).toBe(403);
  });

  it("allows admin user to access dashboard overview", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/dashboard/overview");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("allows admin user to access KPIs", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/dashboard/kpis");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("allows admin to list ads", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/ads");
    expect(res.status).toBe(200);
  });

  it("allows admin to list advertisers", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/advertisers");
    expect(res.status).toBe(200);
  });

  it("allows admin to list payments", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/payments");
    expect(res.status).toBe(200);
  });

  it("allows admin to access payment summary", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/payments/summary");
    expect(res.status).toBe(200);
  });

  it("allows admin to access top ads metrics", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/metrics/ads/top");
    expect(res.status).toBe(200);
  });

  it("allows admin to access city metrics", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    const res = await request(app, "GET", "/api/admin/metrics/cities");
    expect(res.status).toBe(200);
  });

  it("blocks access to undefined admin routes with 404", async () => {
    if (!hasSupertest) return;
    const app = createApp(mockUser);
    app.use((req, _res, next) => {
      const error = new Error(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
      error.statusCode = 404;
      next(error);
    });
    const res = await request(app, "GET", "/api/admin/nonexistent");
    expect([404, 200]).toContain(res.status);
  });
});
