import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

vi.mock("../../src/modules/admin/home/admin-home.service.js", () => ({
  listHeroBanners: vi.fn(),
  getHeroBanner: vi.fn(),
  updateHeroBanner: vi.fn(),
  uploadHeroImage: vi.fn(),
  // listPublicHeroBanners não é usado nas rotas admin, mas o módulo
  // exporta — fica como noop pra satisfazer importadores.
  listPublicHeroBanners: vi.fn(),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import {
  listHeroBanners,
  getHeroBanner,
  updateHeroBanner,
} from "../../src/modules/admin/home/admin-home.service.js";

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
  it("user comum recebe 403 no GET lista", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser)).get("/api/admin/home/hero");
    expect(res.status).toBe(403);
  });

  it("user comum recebe 403 no PATCH /:position", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser))
      .patch("/api/admin/home/hero/1")
      .send({ title: "X", reason: "y" });
    expect(res.status).toBe(403);
  });
});

describe("/api/admin/home/hero — GET (lista)", () => {
  it("admin recebe { data: { banners: [...] } }", async () => {
    if (!supertest) return;
    listHeroBanners.mockResolvedValueOnce([
      { id: 1, key: "home_hero_1", section_type: "home_hero", position: 1, is_active: true },
      { id: 2, key: "home_hero_2", section_type: "home_hero", position: 2, is_active: false },
      { id: 3, key: "home_hero_3", section_type: "home_hero", position: 3, is_active: false },
    ]);
    const res = await supertest(createApp(adminUser)).get("/api/admin/home/hero");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.banners)).toBe(true);
    expect(res.body.data.banners).toHaveLength(3);
  });
});

describe("/api/admin/home/hero/:position — GET", () => {
  it("admin recebe o banner correto", async () => {
    if (!supertest) return;
    getHeroBanner.mockResolvedValueOnce({
      id: 2,
      key: "home_hero_2",
      section_type: "home_hero",
      position: 2,
      is_active: true,
    });
    const res = await supertest(createApp(adminUser)).get("/api/admin/home/hero/2");
    expect(res.status).toBe(200);
    expect(res.body.data.position).toBe(2);
  });

  it("404 quando banner não encontrado", async () => {
    if (!supertest) return;
    getHeroBanner.mockResolvedValueOnce(null);
    const res = await supertest(createApp(adminUser)).get("/api/admin/home/hero/1");
    expect(res.status).toBe(404);
  });
});

describe("/api/admin/home/hero/:position — PATCH", () => {
  it("PATCH delega para service com position correta e propaga reason", async () => {
    if (!supertest) return;
    updateHeroBanner.mockResolvedValueOnce({
      id: 1,
      key: "home_hero_1",
      section_type: "home_hero",
      position: 1,
      title: "Novo",
      version: 2,
    });
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/home/hero/1")
      .send({ title: "Novo", reason: "campanha" });
    expect(res.status).toBe(200);
    expect(updateHeroBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        position: "1",
        payload: expect.objectContaining({ title: "Novo" }),
        reason: "campanha",
      })
    );
  });

  it("PATCH do banner 1 NÃO dispara service do banner 2", async () => {
    if (!supertest) return;
    updateHeroBanner.mockResolvedValueOnce({
      id: 1,
      key: "home_hero_1",
      section_type: "home_hero",
      position: 1,
    });
    await supertest(createApp(adminUser))
      .patch("/api/admin/home/hero/1")
      .send({ title: "B1", reason: "x" });
    const positionsCalled = updateHeroBanner.mock.calls.map((c) => c[0].position);
    expect(positionsCalled).toEqual(["1"]);
  });

  it("PATCH sem reason → 400 (via service mockado que rejeita)", async () => {
    if (!supertest) return;
    updateHeroBanner.mockRejectedValueOnce(
      Object.assign(new Error("Motivo (reason) é obrigatório para alterar o banner."), {
        statusCode: 400,
      })
    );
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/home/hero/1")
      .send({ title: "Novo" });
    expect(res.status).toBe(400);
  });
});
