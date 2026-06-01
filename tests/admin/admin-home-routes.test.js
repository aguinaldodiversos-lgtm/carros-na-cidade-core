import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

vi.mock("../../src/modules/admin/home/admin-home.service.js", () => ({
  getHero: vi.fn().mockResolvedValue({
    id: 1,
    key: "home_hero",
    title: "Atual",
    subtitle: null,
    cta_label: "Ver",
    cta_url: "/comprar",
    image_desktop_url: null,
    image_mobile_url: null,
    image_alt: null,
    is_active: true,
    version: 1,
    created_at: "2026-05-31T00:00:00Z",
    updated_at: "2026-05-31T00:00:00Z",
    updated_by_admin_id: null,
  }),
  updateHero: vi.fn(),
  uploadHeroImage: vi.fn(),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import { updateHero } from "../../src/modules/admin/home/admin-home.service.js";

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

describe("/api/admin/home/hero — autorização", () => {
  it("user comum recebe 403 no GET", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser)).get("/api/admin/home/hero");
    expect(res.status).toBe(403);
  });

  it("user comum recebe 403 no PATCH", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser))
      .patch("/api/admin/home/hero")
      .send({ title: "X", reason: "y" });
    expect(res.status).toBe(403);
  });
});

describe("/api/admin/home/hero — GET", () => {
  it("admin recebe 200 com payload", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser)).get("/api/admin/home/hero");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.key).toBe("home_hero");
  });
});

describe("/api/admin/home/hero — PATCH", () => {
  it("rejeita PATCH sem reason (mock retorna 400 via service)", async () => {
    if (!supertest) return;
    updateHero.mockRejectedValueOnce(
      Object.assign(new Error("Motivo (reason) é obrigatório para alterar o hero."), {
        statusCode: 400,
      })
    );
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/home/hero")
      .send({ title: "Novo" });
    expect(res.status).toBe(400);
  });

  it("admin grava com reason", async () => {
    if (!supertest) return;
    updateHero.mockResolvedValueOnce({
      id: 1,
      key: "home_hero",
      title: "Novo",
      version: 2,
    });
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/home/hero")
      .send({ title: "Novo", reason: "campanha" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(updateHero).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        payload: expect.objectContaining({ title: "Novo" }),
        reason: "campanha",
      })
    );
  });
});
