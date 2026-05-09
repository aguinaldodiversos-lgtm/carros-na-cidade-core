import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Tarefa 4 — teste de integração HTTP da fila de moderação.
 *
 * Cobre:
 *   • Usuário comum recebe 403 em GET /api/admin/moderation/ads.
 *   • Usuário comum recebe 403 em POST .../approve|reject|request-correction.
 *   • Admin recebe 200 e o service é invocado.
 *   • Sem auth, recebe 401.
 *
 * Estratégia:
 *   - importa o router real de `src/modules/admin/admin.routes.js` (com a
 *     ordem real `authMiddleware` → `requireAdmin()`);
 *   - mocka `authMiddleware` para popular `req.user` conforme cabeçalho;
 *   - mocka `moderationService` para garantir que NUNCA é chamado em
 *     cenário de 401/403 (e que é chamado no caminho admin).
 *
 * Não toca banco. Não toca rede.
 */

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => {
  return {
    default: (req, res, next) => {
      const flag = req.headers["x-test-user"];
      if (flag === "admin") {
        req.user = { id: "admin-1", role: "admin" };
        return next();
      }
      if (flag === "user") {
        req.user = { id: "user-1", role: "user" };
        return next();
      }
      return res.status(401).json({ error: "unauth" });
    },
    authMiddleware: (req, res, next) => {
      const flag = req.headers["x-test-user"];
      if (flag === "admin") {
        req.user = { id: "admin-1", role: "admin" };
        return next();
      }
      if (flag === "user") {
        req.user = { id: "user-1", role: "user" };
        return next();
      }
      return res.status(401).json({ error: "unauth" });
    },
  };
});

// Stub de todos os services para isolar de DB. Apenas moderationService
// importa de fato — os demais precisam estar mockados para o router subir.
vi.mock("../../src/modules/admin/dashboard/admin-dashboard.service.js", () => ({
  getOverview: vi.fn(),
  getKpis: vi.fn(),
}));
vi.mock("../../src/modules/admin/ads/admin-ads.service.js", () => ({
  listAds: vi.fn(),
  getAdById: vi.fn(),
  changeAdStatus: vi.fn(),
  setAdHighlight: vi.fn(),
  grantManualBoost: vi.fn(),
  setAdPriority: vi.fn(),
  getAdMetrics: vi.fn(),
  getAdEvents: vi.fn(),
}));
vi.mock("../../src/modules/admin/advertisers/admin-advertisers.service.js", () => ({
  listAdvertisers: vi.fn(),
  getAdvertiserById: vi.fn(),
  changeAdvertiserStatus: vi.fn(),
  getAdvertiserAds: vi.fn(),
}));
vi.mock("../../src/modules/admin/payments/admin-payments.service.js", () => ({
  listPayments: vi.fn(),
  getPaymentsSummary: vi.fn(),
}));
vi.mock("../../src/modules/admin/metrics/admin-metrics.service.js", () => ({
  getTopAds: vi.fn(),
  getCityMetrics: vi.fn(),
  getRecentEvents: vi.fn(),
  getSeoCityMetrics: vi.fn(),
}));
vi.mock("../../src/modules/admin/moderation/admin-moderation.service.js", () => ({
  listPending: vi.fn(),
  getDetail: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  requestCorrection: vi.fn(),
}));

const moderationService = await import(
  "../../src/modules/admin/moderation/admin-moderation.service.js"
);
const adminRouter = (await import("../../src/modules/admin/admin.routes.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  // Error handler igual ao do projeto: traduz AppError em status code.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err?.statusCode || 500;
    res.status(status).json({ error: err?.message || "internal" });
  });
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(moderationService)) {
    if (typeof fn === "function" && fn.mockReset) fn.mockReset();
  }
});

describe("GET /api/admin/moderation/ads — proteção admin", () => {
  it("sem auth → 401 e service não é chamado", async () => {
    const res = await request(buildApp()).get("/api/admin/moderation/ads");
    expect(res.status).toBe(401);
    expect(moderationService.listPending).not.toHaveBeenCalled();
  });

  it("usuário comum (role=user) → 403", async () => {
    const res = await request(buildApp())
      .get("/api/admin/moderation/ads")
      .set("x-test-user", "user");
    expect(res.status).toBe(403);
    expect(moderationService.listPending).not.toHaveBeenCalled();
  });

  it("admin (role=admin) → 200 e service invocado", async () => {
    moderationService.listPending.mockResolvedValue({
      data: [{ id: 1, title: "Civic", risk_score: 80, risk_level: "high" }],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const res = await request(buildApp())
      .get("/api/admin/moderation/ads")
      .set("x-test-user", "admin");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(moderationService.listPending).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/admin/moderation/ads/:id/approve|reject|request-correction", () => {
  it("user comum não consegue aprovar (403)", async () => {
    const res = await request(buildApp())
      .post("/api/admin/moderation/ads/42/approve")
      .set("x-test-user", "user");
    expect(res.status).toBe(403);
    expect(moderationService.approve).not.toHaveBeenCalled();
  });

  it("user comum não consegue rejeitar (403)", async () => {
    const res = await request(buildApp())
      .post("/api/admin/moderation/ads/42/reject")
      .set("x-test-user", "user")
      .send({ reason: "qualquer" });
    expect(res.status).toBe(403);
    expect(moderationService.reject).not.toHaveBeenCalled();
  });

  it("admin aprova e service recebe (adminUserId, adId)", async () => {
    moderationService.approve.mockResolvedValue({ ok: true, status: "active" });
    const res = await request(buildApp())
      .post("/api/admin/moderation/ads/42/approve")
      .set("x-test-user", "admin");
    expect(res.status).toBe(200);
    expect(moderationService.approve).toHaveBeenCalledWith("admin-1", "42");
  });

  it("admin rejeita exigindo motivo — sem motivo retorna 400", async () => {
    const res = await request(buildApp())
      .post("/api/admin/moderation/ads/42/reject")
      .set("x-test-user", "admin")
      .send({});
    expect(res.status).toBe(400);
    expect(moderationService.reject).not.toHaveBeenCalled();
  });

  it("admin rejeita com motivo válido — service invocado", async () => {
    moderationService.reject.mockResolvedValue({ ok: true, status: "rejected" });
    const res = await request(buildApp())
      .post("/api/admin/moderation/ads/42/reject")
      .set("x-test-user", "admin")
      .send({ reason: "Foto não confere com o veículo." });
    expect(res.status).toBe(200);
    expect(moderationService.reject).toHaveBeenCalledWith(
      "admin-1",
      "42",
      "Foto não confere com o veículo."
    );
  });

  it("admin solicita correção — sem motivo 400; com motivo 200", async () => {
    const noReason = await request(buildApp())
      .post("/api/admin/moderation/ads/42/request-correction")
      .set("x-test-user", "admin")
      .send({});
    expect(noReason.status).toBe(400);

    moderationService.requestCorrection.mockResolvedValue({
      ok: true,
      status: "pending_review",
    });
    const ok = await request(buildApp())
      .post("/api/admin/moderation/ads/42/request-correction")
      .set("x-test-user", "admin")
      .send({ reason: "Adicione foto traseira." });
    expect(ok.status).toBe(200);
    expect(moderationService.requestCorrection).toHaveBeenCalledWith(
      "admin-1",
      "42",
      "Adicione foto traseira."
    );
  });
});
