/**
 * Fase 4.10A — rotas de bloqueio/reativação administrativa.
 *
 * Os testes de serviço provam que a regra existe. Estes provam que ela é
 * ALCANÇÁVEL pela rota real: autorização de verdade (herdada do router), o
 * corpo chegando ao serviço, e o DTO do histórico sem a identidade do admin.
 * Uma regra correta atrás de uma rota que ninguém alcança não protege nada.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn(),
}));

// O serviço de bloqueio é substituído porque o alvo aqui é o ROUTER
// (autorização, parsing do corpo, forma da resposta). As invariantes de
// domínio têm cobertura própria em admin-ad-block.service.test.js.
vi.mock("../../src/modules/admin/ads/admin-ad-block.service.js", () => ({
  blockAd: vi.fn(),
  unblockAd: vi.fn(),
  listModerationHistory: vi.fn(),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (req, res, next) => {
    // Sem `req.user` injetado pelo app de teste = requisição anônima.
    if (!req.user) return res.status(401).json({ ok: false, error: "unauthorized" });
    next();
  },
}));

import * as blockService from "../../src/modules/admin/ads/admin-ad-block.service.js";
import adminRoutes from "../../src/modules/admin/admin.routes.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";

const adminUser = { id: "admin-1", role: "admin", plan: "free" };
const dealerUser = { id: "dealer-9", role: "user", plan: "pro", account_type: "CNPJ" };
const personUser = { id: "person-3", role: "user", plan: "free", account_type: "CPF" };

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

beforeAll(async () => {
  supertest = (await import("supertest")).default;
});

beforeEach(() => {
  vi.mocked(blockService.blockAd).mockReset();
  vi.mocked(blockService.unblockAd).mockReset();
  vi.mocked(blockService.listModerationHistory).mockReset();
  vi.mocked(blockService.blockAd).mockResolvedValue({
    changed: true,
    ad: { id: "42", status: "blocked" },
  });
  vi.mocked(blockService.unblockAd).mockResolvedValue({
    changed: true,
    ad: { id: "42", status: "active" },
  });
  vi.mocked(blockService.listModerationHistory).mockResolvedValue([]);
});

describe("autorização — PATCH /api/admin/ads/:id/block", () => {
  it("401 sem autenticação", async () => {
    const res = await supertest(createApp(null))
      .patch("/api/admin/ads/42/block")
      .send({ reason_code: "suspected_fraud" });

    expect(res.status).toBe(401);
    expect(blockService.blockAd).not.toHaveBeenCalled();
  });

  it("403 para lojista (CNPJ) autenticado", async () => {
    const res = await supertest(createApp(dealerUser))
      .patch("/api/admin/ads/42/block")
      .send({ reason_code: "suspected_fraud" });

    expect(res.status).toBe(403);
    expect(blockService.blockAd).not.toHaveBeenCalled();
  });

  it("403 para pessoa física autenticada", async () => {
    const res = await supertest(createApp(personUser))
      .patch("/api/admin/ads/42/block")
      .send({ reason_code: "suspected_fraud" });

    expect(res.status).toBe(403);
    expect(blockService.blockAd).not.toHaveBeenCalled();
  });

  it("200 para admin", async () => {
    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/ads/42/block")
      .send({ reason_code: "suspected_fraud" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(blockService.blockAd).toHaveBeenCalledWith("admin-1", "42", {
      reasonCode: "suspected_fraud",
      note: undefined,
    });
  });
});

describe("autorização — PATCH /api/admin/ads/:id/unblock", () => {
  it("401 sem autenticação", async () => {
    const res = await supertest(createApp(null)).patch("/api/admin/ads/42/unblock").send({});
    expect(res.status).toBe(401);
    expect(blockService.unblockAd).not.toHaveBeenCalled();
  });

  it("403 para lojista", async () => {
    const res = await supertest(createApp(dealerUser)).patch("/api/admin/ads/42/unblock").send({});
    expect(res.status).toBe(403);
    expect(blockService.unblockAd).not.toHaveBeenCalled();
  });

  it("403 para pessoa física", async () => {
    const res = await supertest(createApp(personUser)).patch("/api/admin/ads/42/unblock").send({});
    expect(res.status).toBe(403);
    expect(blockService.unblockAd).not.toHaveBeenCalled();
  });

  it("200 para admin", async () => {
    const res = await supertest(createApp(adminUser)).patch("/api/admin/ads/42/unblock").send({});
    expect(res.status).toBe(200);
    expect(blockService.unblockAd).toHaveBeenCalledWith("admin-1", "42", { note: undefined });
  });
});

describe("autorização — GET /api/admin/ads/:id/moderation-history", () => {
  it("401 sem autenticação", async () => {
    const res = await supertest(createApp(null)).get("/api/admin/ads/42/moderation-history");
    expect(res.status).toBe(401);
  });

  it("403 para usuário comum", async () => {
    const res = await supertest(createApp(personUser)).get("/api/admin/ads/42/moderation-history");
    expect(res.status).toBe(403);
  });
});

describe("contrato da rota de bloqueio", () => {
  it("400 quando reason_code não vem no corpo", async () => {
    const res = await supertest(createApp(adminUser)).patch("/api/admin/ads/42/block").send({});

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/reason_code/);
    expect(blockService.blockAd).not.toHaveBeenCalled();
  });

  it("repassa a observação administrativa", async () => {
    await supertest(createApp(adminUser))
      .patch("/api/admin/ads/42/block")
      .send({ reason_code: "other", note: "documento divergente" });

    expect(blockService.blockAd).toHaveBeenCalledWith("admin-1", "42", {
      reasonCode: "other",
      note: "documento divergente",
    });
  });

  it("devolve changed:false no retry idempotente, com 200", async () => {
    vi.mocked(blockService.blockAd).mockResolvedValue({
      changed: false,
      ad: { id: "42", status: "blocked" },
    });

    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/ads/42/block")
      .send({ reason_code: "suspected_fraud" });

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
  });

  it("propaga o erro de domínio de motivo inválido", async () => {
    const { AppError } = await import("../../src/shared/middlewares/error.middleware.js");
    vi.mocked(blockService.blockAd).mockRejectedValue(
      new AppError("Motivo de bloqueio inválido.", 400)
    );

    const res = await supertest(createApp(adminUser))
      .patch("/api/admin/ads/42/block")
      .send({ reason_code: "porque_sim" });

    expect(res.status).toBe(400);
  });
});

describe("histórico de moderação — DTO", () => {
  it("não expõe a identidade do administrador", async () => {
    vi.mocked(blockService.listModerationHistory).mockResolvedValue([
      {
        id: 7,
        event_type: "admin_blocked",
        actor_user_id: "admin-1",
        actor_role: "admin",
        from_status: "active",
        to_status: "blocked",
        reason: "suspected_fraud",
        metadata: { reason_code: "suspected_fraud", note: "nota interna" },
        created_at: "2026-08-25T10:32:00.000Z",
      },
    ]);

    const res = await supertest(createApp(adminUser)).get("/api/admin/ads/42/moderation-history");

    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("actor_user_id");
    expect(raw).not.toContain("admin-1");
    expect(res.body.data[0]).toMatchObject({
      event_type: "admin_blocked",
      from_status: "active",
      to_status: "blocked",
      reason_code: "suspected_fraud",
    });
  });
});
