import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

// O service roda de verdade; só o repositório é substituído, para que a
// validação de filtros, o clamp de paginação e a montagem do DTO sejam
// exercitados pelo caminho real da rota.
vi.mock("../../src/modules/admin/users/admin-users.repository.js", () => ({
  listUsers: vi.fn(),
  findUserById: vi.fn(),
  listAdvertisersByUserId: vi.fn(),
  countAdsByUserId: vi.fn(),
  countPurchaseIntentsByUserId: vi.fn(),
  listRecentPurchaseIntentsByUserId: vi.fn(),
  countReceivedOffersByUserId: vi.fn(),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

import * as repo from "../../src/modules/admin/users/admin-users.repository.js";
import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import {
  ADMIN_PAGE_LIMIT_MAX,
  ADMIN_PAGE_LIMIT_MIN,
  ADMIN_PAGE_LIMIT_DEFAULT,
} from "../../src/modules/admin/admin.pagination.js";

const adminUser = { id: "admin-1", role: "admin", plan: "free" };
const regularUser = { id: "user-1", role: "user", plan: "free" };

function createApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) {
      req.user = user;
      req.auth = { token: "test", decoded: { id: user.id } };
    }
    next();
  });
  app.use("/api/admin", adminRoutes);
  app.use(errorHandler);
  return app;
}

let supertest = null;

async function get(app, path) {
  return supertest(app).get(path);
}

describe("GET /api/admin/users", () => {
  beforeAll(async () => {
    try {
      supertest = (await import("supertest")).default;
    } catch {
      supertest = null;
    }
    // Sem supertest não há teste — falhar alto é melhor que 20 casos que
    // retornam cedo e reportam verde sem ter exercitado uma linha sequer.
    expect(supertest, "supertest é obrigatório para esta suíte").toBeTruthy();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.listUsers).mockResolvedValue({ data: [], total: 0, limit: 30, offset: 0 });
    vi.mocked(repo.findUserById).mockResolvedValue(null);
    vi.mocked(repo.listAdvertisersByUserId).mockResolvedValue([]);
    vi.mocked(repo.countAdsByUserId).mockResolvedValue({ active: 0, total: 0 });
    vi.mocked(repo.countPurchaseIntentsByUserId).mockResolvedValue({ total: 0, live: 0 });
    vi.mocked(repo.listRecentPurchaseIntentsByUserId).mockResolvedValue([]);
    vi.mocked(repo.countReceivedOffersByUserId).mockResolvedValue(0);
  });

  // ── §52 AUTH ────────────────────────────────────────────────────────────
  describe("autorização", () => {
    it("usuário comum recebe 403 e não chega ao repositório", async () => {
      const res = await get(createApp(regularUser), "/api/admin/users");
      expect(res.status).toBe(403);
      expect(repo.listUsers).not.toHaveBeenCalled();
    });

    it("requisição sem usuário autenticado recebe 401", async () => {
      const res = await get(createApp(null), "/api/admin/users");
      expect(res.status).toBe(401);
      expect(repo.listUsers).not.toHaveBeenCalled();
    });

    it("admin recebe 200", async () => {
      const res = await get(createApp(adminUser), "/api/admin/users");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("detalhe também é protegido", async () => {
      expect((await get(createApp(regularUser), "/api/admin/users/1")).status).toBe(403);
      expect((await get(createApp(null), "/api/admin/users/1")).status).toBe(401);
    });
  });

  // ── §17 PAGINAÇÃO ───────────────────────────────────────────────────────
  describe("teto e piso de paginação", () => {
    const app = () => createApp(adminUser);

    it("usa o default quando limit é omitido", async () => {
      await get(app(), "/api/admin/users");
      expect(vi.mocked(repo.listUsers).mock.calls[0][0].limit).toBe(ADMIN_PAGE_LIMIT_DEFAULT);
    });

    /**
     * `?limit=0` produzia `LIMIT 0` — lista vazia com HTTP 200. O operador via
     * "nenhum registro" e concluía que o banco estava vazio.
     */
    it("limit=0 é elevado ao mínimo, não vira lista vazia", async () => {
      await get(app(), "/api/admin/users?limit=0");
      expect(vi.mocked(repo.listUsers).mock.calls[0][0].limit).toBe(ADMIN_PAGE_LIMIT_MIN);
    });

    it("limit absurdo é limitado ao teto", async () => {
      await get(app(), "/api/admin/users?limit=100000");
      expect(vi.mocked(repo.listUsers).mock.calls[0][0].limit).toBe(ADMIN_PAGE_LIMIT_MAX);
    });

    it("limit negativo e não numérico não passam", async () => {
      await get(app(), "/api/admin/users?limit=-5");
      expect(vi.mocked(repo.listUsers).mock.calls[0][0].limit).toBe(ADMIN_PAGE_LIMIT_MIN);
      await get(app(), "/api/admin/users?limit=abc");
      expect(vi.mocked(repo.listUsers).mock.calls[1][0].limit).toBe(ADMIN_PAGE_LIMIT_DEFAULT);
    });

    it("offset negativo vira 0 em vez de erro de sintaxe do Postgres", async () => {
      await get(app(), "/api/admin/users?offset=-10");
      expect(vi.mocked(repo.listUsers).mock.calls[0][0].offset).toBe(0);
    });
  });

  // ── §12/§13/§14 FILTROS ─────────────────────────────────────────────────
  describe("filtros chegam ao repositório", () => {
    it("propaga search, account_type e role", async () => {
      await get(createApp(adminUser), "/api/admin/users?search=maria&account_type=CNPJ&role=admin");
      expect(vi.mocked(repo.listUsers).mock.calls[0][0]).toMatchObject({
        search: "maria",
        accountType: "CNPJ",
        role: "admin",
      });
    });

    it.each(["CPF", "CNPJ", "pending"])("aceita account_type=%s", async (accountType) => {
      const res = await get(createApp(adminUser), `/api/admin/users?account_type=${accountType}`);
      expect(res.status).toBe(200);
    });

    it("account_type inválido vira 400 e não consulta o banco", async () => {
      const res = await get(createApp(adminUser), "/api/admin/users?account_type=PJ");
      expect(res.status).toBe(400);
      expect(repo.listUsers).not.toHaveBeenCalled();
    });

    it("role inválido vira 400", async () => {
      expect((await get(createApp(adminUser), "/api/admin/users?role=root")).status).toBe(400);
    });
  });

  // ── §60 ERROS ───────────────────────────────────────────────────────────
  describe("erros", () => {
    it("usuário inexistente devolve 404", async () => {
      const res = await get(createApp(adminUser), "/api/admin/users/999");
      expect(res.status).toBe(404);
    });

    /**
     * `WHERE id = 'abc'` numa coluna BIGINT dispara 22P02 no Postgres, que o
     * errorHandler traduziria em 500. Um 500 por URL digitada errada polui o
     * log de produção e esconde erro de verdade.
     */
    it("id não numérico devolve 400 sem tocar o banco", async () => {
      const res = await get(createApp(adminUser), "/api/admin/users/abc");
      expect(res.status).toBe(400);
      expect(repo.findUserById).not.toHaveBeenCalled();
    });

    it("detalhe existente devolve 200 com identidade e atividade", async () => {
      vi.mocked(repo.findUserById).mockResolvedValue({
        id: 7,
        name: "Maria",
        email: "maria@example.com",
        role: "user",
        document_type: "cnpj",
        plan_id: null,
        plan_name: null,
        email_verified: true,
        is_email_verified: null,
        locked_until: null,
        created_at: "2026-08-01T10:00:00.000Z",
      });
      const res = await get(createApp(adminUser), "/api/admin/users/7");
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: "7", account_type: "CNPJ" });
      expect(res.body.data.activity).toBeDefined();
      // Guarda de PII também no payload HTTP real, não só no DTO em memória.
      expect(JSON.stringify(res.body)).not.toContain("document_number");
      expect(Object.prototype.hasOwnProperty.call(res.body.data, "document_type")).toBe(false);
    });
  });

  // ── §6 SOMENTE LEITURA ──────────────────────────────────────────────────
  describe("superfície somente leitura", () => {
    it.each([
      ["post", "/api/admin/users"],
      ["patch", "/api/admin/users/1"],
      ["delete", "/api/admin/users/1"],
      ["post", "/api/admin/users/1/block"],
    ])("%s %s não existe", async (method, path) => {
      const res = await supertest(createApp(adminUser))[method](path).send({});
      expect(res.status).toBe(404);
    });
  });
});
