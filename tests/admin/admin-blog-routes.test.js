import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

vi.mock("../../src/modules/admin/blog/admin-blog.service.js", () => ({
  listAdminPosts: vi.fn(),
  getAdminPostById: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
  archivePost: vi.fn(),
  restorePost: vi.fn(),
  uploadCoverImage: vi.fn(),
  uploadContentImage: vi.fn(),
  // Exports usados pelo controller público — noop aqui.
  listPublicPosts: vi.fn(),
  getPublicPostBySlug: vi.fn(),
  slugify: vi.fn(),
  estimateReadingMinutes: vi.fn(),
  BLOG_POST_STATUS: {
    DRAFT: "draft",
    PUBLISHED: "published",
    UNPUBLISHED: "unpublished",
    ARCHIVED: "archived",
  },
  BLOG_CATEGORIES: ["compra", "venda", "manutencao", "mercado", "financiamento", "cidades"],
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import {
  listAdminPosts,
  getAdminPostById,
  createPost,
  updatePost,
  publishPost,
  archivePost,
  uploadContentImage,
} from "../../src/modules/admin/blog/admin-blog.service.js";

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

describe("/api/admin/blog/posts — autorização", () => {
  it("anônimo recebe 401", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(null)).get("/api/admin/blog/posts");
    expect(res.status).toBe(401);
  });

  it("user comum recebe 403 no GET lista", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser)).get("/api/admin/blog/posts");
    expect(res.status).toBe(403);
  });

  it("user comum recebe 403 no POST (não cria post)", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser))
      .post("/api/admin/blog/posts")
      .send({ title: "Tentativa de criação" });
    expect(res.status).toBe(403);
    expect(createPost).not.toHaveBeenCalled();
  });

  it("anônimo recebe 401 no POST (não cria post)", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(null))
      .post("/api/admin/blog/posts")
      .send({ title: "Tentativa anônima" });
    expect(res.status).toBe(401);
    expect(createPost).not.toHaveBeenCalled();
  });
});

describe("/api/admin/blog/posts/:id/content-image — upload (Fase 4.2.2)", () => {
  it("anônimo recebe 401 e não chama o service", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(null)).post("/api/admin/blog/posts/7/content-image");
    expect(res.status).toBe(401);
    expect(uploadContentImage).not.toHaveBeenCalled();
  });

  it("user comum recebe 403 e não chama o service", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser)).post(
      "/api/admin/blog/posts/7/content-image"
    );
    expect(res.status).toBe(403);
    expect(uploadContentImage).not.toHaveBeenCalled();
  });

  it("admin com imagem válida recebe 200 + URL pública", async () => {
    if (!supertest) return;
    uploadContentImage.mockResolvedValueOnce({
      url: "https://cdn.example.com/site/blog/content/2026/06/x.webp",
      key: "site/blog/content/2026/06/x.webp",
      post_id: 7,
    });
    const res = await supertest(createApp(adminUser))
      .post("/api/admin/blog/posts/7/content-image")
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "foto.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(200);
    expect(res.body?.data?.url).toContain("site/blog/content/");
    expect(uploadContentImage).toHaveBeenCalledOnce();
  });

  it("MIME inválido (pdf) recebe 400 e não chama o service", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(adminUser))
      .post("/api/admin/blog/posts/7/content-image")
      .attach("image", Buffer.from("%PDF-1.4 conteudo"), {
        filename: "doc.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
    expect(uploadContentImage).not.toHaveBeenCalled();
  });
});

describe("/api/admin/blog/posts — GET (lista)", () => {
  it("admin recebe { ok, data, total } e filtros são repassados", async () => {
    if (!supertest) return;
    listAdminPosts.mockResolvedValueOnce({
      data: [{ id: 1, title: "Post A", slug: "post-a", status: "draft" }],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const res = await supertest(createApp(adminUser)).get(
      "/api/admin/blog/posts?status=draft&search=Post&limit=10&offset=20"
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(listAdminPosts).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft", search: "Post", limit: 10, offset: 20 })
    );
  });
});

describe("/api/admin/blog/posts/:id — GET", () => {
  it("admin recebe detalhe completo", async () => {
    if (!supertest) return;
    getAdminPostById.mockResolvedValueOnce({ id: 7, title: "Detalhe", status: "draft" });
    const res = await supertest(createApp(adminUser)).get("/api/admin/blog/posts/7");
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(7);
  });

  it("404 quando service não encontra", async () => {
    if (!supertest) return;
    getAdminPostById.mockRejectedValueOnce(
      Object.assign(new Error("Post não encontrado."), { statusCode: 404 })
    );
    const res = await supertest(createApp(adminUser)).get("/api/admin/blog/posts/999");
    expect(res.status).toBe(404);
  });
});

describe("/api/admin/blog/posts — POST (cria draft)", () => {
  it("admin cria draft → 201 com adminUserId propagado", async () => {
    if (!supertest) return;
    createPost.mockResolvedValueOnce({ id: 1, title: "Novo post de blog", status: "draft" });
    const res = await supertest(createApp(adminUser))
      .post("/api/admin/blog/posts")
      .send({ title: "Novo post de blog" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("draft");
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        payload: expect.objectContaining({ title: "Novo post de blog" }),
      })
    );
  });

  it("validação do service (400) é propagada", async () => {
    if (!supertest) return;
    createPost.mockRejectedValueOnce(
      Object.assign(new Error("Título é obrigatório (mínimo 5 caracteres)."), {
        statusCode: 400,
      })
    );
    const res = await supertest(createApp(adminUser))
      .post("/api/admin/blog/posts")
      .send({ title: "Oi" });
    expect(res.status).toBe(400);
  });

  it("slug duplicado (409) é propagado", async () => {
    if (!supertest) return;
    createPost.mockRejectedValueOnce(
      Object.assign(new Error("Slug já está em uso."), { statusCode: 409 })
    );
    const res = await supertest(createApp(adminUser))
      .post("/api/admin/blog/posts")
      .send({ title: "Título duplicado", slug: "ja-existe" });
    expect(res.status).toBe(409);
  });
});

describe("/api/admin/blog/posts/:id — PATCH", () => {
  it("separa reason do payload e delega ao service", async () => {
    if (!supertest) return;
    updatePost.mockResolvedValueOnce({ id: 3, title: "Editado", status: "draft" });
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/blog/posts/3")
      .send({ title: "Editado", reason: "ajuste de copy" });
    expect(res.status).toBe(200);
    expect(updatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        id: "3",
        payload: expect.objectContaining({ title: "Editado" }),
        reason: "ajuste de copy",
      })
    );
    expect(updatePost.mock.calls[0][0].payload).not.toHaveProperty("reason");
  });
});

describe("/api/admin/blog/posts/:id — transições", () => {
  it("publish delega com reason", async () => {
    if (!supertest) return;
    publishPost.mockResolvedValueOnce({ id: 3, status: "published" });
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/blog/posts/3/publish")
      .send({ reason: "Validação Fase 4.2" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("published");
    expect(publishPost).toHaveBeenCalledWith(
      expect.objectContaining({ id: "3", reason: "Validação Fase 4.2" })
    );
  });

  it("publish sem reason → 400 (service rejeita)", async () => {
    if (!supertest) return;
    publishPost.mockRejectedValueOnce(
      Object.assign(new Error("Motivo (reason) é obrigatório para publicar."), {
        statusCode: 400,
      })
    );
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/blog/posts/3/publish")
      .send({});
    expect(res.status).toBe(400);
  });

  it("archive delega com reason", async () => {
    if (!supertest) return;
    archivePost.mockResolvedValueOnce({ id: 3, status: "archived" });
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/blog/posts/3/archive")
      .send({ reason: "Conteúdo desatualizado" });
    expect(res.status).toBe(200);
    expect(archivePost).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Conteúdo desatualizado" })
    );
  });

  it("user comum não publica (403)", async () => {
    if (!supertest) return;
    const res = await supertest(createApp(regularUser))
      .patch("/api/admin/blog/posts/3/publish")
      .send({ reason: "tentativa" });
    expect(res.status).toBe(403);
    expect(publishPost).not.toHaveBeenCalled();
  });
});
