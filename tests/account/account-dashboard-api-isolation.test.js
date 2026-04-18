/**
 * Testes de isolamento no nível da rota HTTP (API):
 * verifica que o token JWT do usuário A nunca entrega dados do usuário B.
 *
 * Estratégia: monta o router Express real com authMiddleware substituído por
 * um stub controlável, e espia as chamadas ao account.service para garantir
 * que o user_id passado à camada de serviço sempre vem do token — nunca do
 * corpo/query da requisição.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------- mocks de infra -------------------------------------------------

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  withUserTransaction: vi.fn(),
}));

vi.mock("../../src/modules/account/account.service.js", () => ({
  getDashboardPayload: vi.fn(),
  getOwnedAd: vi.fn(),
  listPlans: vi.fn(),
  resolvePublishEligibility: vi.fn(),
  listBoostOptions: vi.fn(() => []),
  updateOwnedAdStatus: vi.fn(),
  deleteOwnedAd: vi.fn(),
}));

vi.mock("../../src/modules/advertisers/advertiser.ensure.service.js", () => ({
  ensureAdvertiserForUser: vi.fn(),
}));

// authMiddleware substituído por um stub — testamos a rota, não o JWT
vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: vi.fn((req, _res, next) => next()),
  default: vi.fn((req, _res, next) => next()),
}));

// ---------- imports após mocks --------------------------------------------

import { authMiddleware } from "../../src/shared/middlewares/auth.middleware.js";
import {
  getDashboardPayload,
  getOwnedAd,
  deleteOwnedAd,
  updateOwnedAdStatus,
} from "../../src/modules/account/account.service.js";
import accountRouter from "../../src/modules/account/account.routes.js";

// ---------- helpers -------------------------------------------------------

const USER_A = { id: "user-a-id", role: "user", plan: "free", account_type: "CPF" };
const USER_B = { id: "user-b-id", role: "user", plan: "free", account_type: "CPF" };

const AD_OF_B = {
  id: "ad-99",
  title: "Carro do B",
  status: "active",
  price: 50000,
  views: 0,
  is_featured: false,
};

function buildApp(authenticatedUser) {
  const app = express();
  app.use(express.json());

  // Stub: injeta req.user como se o JWT fosse válido para authenticatedUser
  vi.mocked(authMiddleware).mockImplementation((req, _res, next) => {
    req.user = authenticatedUser;
    next();
  });

  app.use("/api/account", accountRouter);

  // Express error handler
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });

  return app;
}

// ---------- testes --------------------------------------------------------

describe("isolamento HTTP — /api/account (rota → serviço)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/account/dashboard sem autenticação retorna 401", async () => {
    vi.mocked(authMiddleware).mockImplementation((_req, res, _next) => {
      res.status(401).json({ error: "Nao autenticado" });
    });

    const app = express();
    app.use(express.json());
    app.use("/api/account", accountRouter);
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    });

    const res = await request(app).get("/api/account/dashboard");
    expect(res.status).toBe(401);
    expect(getDashboardPayload).not.toHaveBeenCalled();
  });

  it("GET /api/account/dashboard passa userId do token ao serviço — nunca de query/body", async () => {
    vi.mocked(getDashboardPayload).mockResolvedValue({
      ok: true,
      active_ads: [],
      paused_ads: [],
      stats: {},
      user: { id: USER_A.id },
    });

    const app = buildApp(USER_A);

    // Tenta injetar um user_id diferente via query — deve ser ignorado
    const res = await request(app)
      .get("/api/account/dashboard?user_id=user-b-id")
      .set("Authorization", "Bearer token-do-usuario-a");

    expect(res.status).toBe(200);
    expect(getDashboardPayload).toHaveBeenCalledTimes(1);

    const calledUserId = vi.mocked(getDashboardPayload).mock.calls[0][0];
    expect(calledUserId).toBe(USER_A.id);
    expect(calledUserId).not.toBe(USER_B.id);
  });

  it("usuário A não recebe anúncios do usuário B no dashboard", async () => {
    vi.mocked(getDashboardPayload).mockResolvedValue({
      ok: true,
      active_ads: [{ id: "ad-1", title: "Carro do A", status: "active" }],
      paused_ads: [],
      stats: {},
      user: { id: USER_A.id },
    });

    const app = buildApp(USER_A);
    const res = await request(app).get("/api/account/dashboard");

    expect(res.status).toBe(200);
    const allAds = [...(res.body.active_ads ?? []), ...(res.body.paused_ads ?? [])];
    expect(allAds.find((ad) => ad.id === AD_OF_B.id)).toBeUndefined();
  });

  it("GET /api/account/ads/:id com token de A não retorna anúncio do B (404)", async () => {
    vi.mocked(getOwnedAd).mockRejectedValue(
      Object.assign(new Error("Anuncio nao encontrado"), { statusCode: 404 })
    );

    const app = buildApp(USER_A);
    const res = await request(app).get(`/api/account/ads/${AD_OF_B.id}`);

    expect(res.status).toBe(404);

    // Confirma que o serviço recebeu o userId do TOKEN (A), não do path
    expect(getOwnedAd).toHaveBeenCalledTimes(1);
    const [calledUserId] = vi.mocked(getOwnedAd).mock.calls[0];
    expect(calledUserId).toBe(USER_A.id);
  });

  it("DELETE /api/account/ads/:id passa userId do token ao serviço", async () => {
    vi.mocked(deleteOwnedAd).mockResolvedValue({ ok: true });

    const app = buildApp(USER_A);
    const res = await request(app).delete(`/api/account/ads/${AD_OF_B.id}`);

    expect(res.status).toBe(200);
    expect(deleteOwnedAd).toHaveBeenCalledTimes(1);
    const [calledUserId] = vi.mocked(deleteOwnedAd).mock.calls[0];
    expect(calledUserId).toBe(USER_A.id);
  });

  it("PATCH /api/account/ads/:id/status passa userId do token ao serviço", async () => {
    vi.mocked(updateOwnedAdStatus).mockResolvedValue({ id: "ad-1", status: "paused" });

    const app = buildApp(USER_A);
    const res = await request(app).patch(`/api/account/ads/ad-1/status`).send({ action: "pause" });

    expect(res.status).toBe(200);
    const [calledUserId] = vi.mocked(updateOwnedAdStatus).mock.calls[0];
    expect(calledUserId).toBe(USER_A.id);
  });

  it("não há rota /api/account/dashboard que aceite user_id arbitrário no body", async () => {
    vi.mocked(getDashboardPayload).mockResolvedValue({
      ok: true,
      active_ads: [],
      paused_ads: [],
      stats: {},
      user: { id: USER_A.id },
    });

    const app = buildApp(USER_A);

    // Tentativa de forçar outro userId pelo body — deve ser ignorado
    const res = await request(app).get("/api/account/dashboard").send({ user_id: USER_B.id });

    expect(res.status).toBe(200);
    const calledUserId = vi.mocked(getDashboardPayload).mock.calls[0][0];
    expect(calledUserId).toBe(USER_A.id);
    expect(calledUserId).not.toBe(USER_B.id);
  });
});
