/**
 * `POST /api/account/plans/eligibility` é LEITURA — não cria anunciante.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE TESTE PROTEGE
 * ────────────────────────────────────────────────────────────────────────────
 * Esta rota era o único caminho de produção que chamava `ensureAdvertiserForUser`
 * SEM `cityId` — e portanto o único que alcançava o fallback territorial
 * (`users.city` por ILIKE, e depois "a primeira cidade da tabela"). Perguntar
 * "posso publicar?" criava, de lambuja, um anunciante numa cidade adivinhada.
 *
 * A resposta nunca dependeu disso: `resolvePublishEligibility` lê documento,
 * plano e contagem de anúncios; sem linha em `advertisers` o JOIN devolve 0,
 * que é a resposta certa para quem ainda não publicou.
 *
 * O teste falha se alguém reintroduzir a chamada — inclusive de forma indireta,
 * porque afirma sobre o MÓDULO de ensure inteiro, não sobre a linha de código.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  withUserTransaction: vi.fn(),
}));

vi.mock("../../src/modules/account/account.service.js", () => ({
  getDashboardPayload: vi.fn(),
  getOwnedAd: vi.fn(),
  listPlans: vi.fn(async () => []),
  listOwnedHistoryAds: vi.fn(async () => []),
  resolvePublishEligibility: vi.fn(async () => ({
    allowed: true,
    reason: "Limite gratuito disponivel",
    suggested_plan_type: null,
  })),
  listBoostOptions: vi.fn(() => []),
  listBoostOptionsAsync: vi.fn(async () => []),
  updateOwnedAdStatus: vi.fn(),
  deleteOwnedAd: vi.fn(),
}));

// Espião do domínio inteiro de criação de anunciante.
vi.mock("../../src/modules/advertisers/advertiser.ensure.service.js", () => ({
  ensureAdvertiserForUser: vi.fn(),
  ensureAdvertiserForPublishing: vi.fn(),
  resolveCityIdForNewAdvertiser: vi.fn(),
}));

vi.mock("../../src/modules/account/store-profile.service.js", () => ({
  getStoreProfile: vi.fn(),
  updateStoreProfile: vi.fn(),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: vi.fn((req, _res, next) => {
    req.user = { id: "user-1", role: "user", plan: "free", account_type: "CPF" };
    next();
  }),
  default: vi.fn((req, _res, next) => {
    req.user = { id: "user-1", role: "user", plan: "free", account_type: "CPF" };
    next();
  }),
}));

import * as advertiserEnsure from "../../src/modules/advertisers/advertiser.ensure.service.js";
import { resolvePublishEligibility } from "../../src/modules/account/account.service.js";
import accountRouter from "../../src/modules/account/account.routes.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/account", accountRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /account/plans/eligibility — sem efeito colateral", () => {
  it("responde 200 sem criar anunciante", async () => {
    const res = await request(buildApp()).post("/api/account/plans/eligibility").send({});

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(advertiserEnsure.ensureAdvertiserForUser).not.toHaveBeenCalled();
  });

  it("nenhuma função do domínio de anunciante é tocada", async () => {
    await request(buildApp()).post("/api/account/plans/eligibility").send({});

    expect(advertiserEnsure.ensureAdvertiserForUser).not.toHaveBeenCalled();
    expect(advertiserEnsure.ensureAdvertiserForPublishing).not.toHaveBeenCalled();
    expect(advertiserEnsure.resolveCityIdForNewAdvertiser).not.toHaveBeenCalled();
  });

  it("a regra de elegibilidade continua sendo consultada com o id da sessão", async () => {
    await request(buildApp()).post("/api/account/plans/eligibility").send({ user_id: "outro" });

    expect(resolvePublishEligibility).toHaveBeenCalledTimes(1);
    // Vem do token, nunca do corpo.
    expect(resolvePublishEligibility).toHaveBeenCalledWith("user-1");
  });

  it("continua respondendo mesmo para conta sem anunciante nenhum (contagem 0)", async () => {
    resolvePublishEligibility.mockResolvedValueOnce({
      allowed: false,
      reason: "Para anunciar, é necessário verificar o CPF.",
      suggested_plan_type: "CPF",
    });

    const res = await request(buildApp()).post("/api/account/plans/eligibility").send({});

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(advertiserEnsure.ensureAdvertiserForUser).not.toHaveBeenCalled();
  });
});

describe("account.routes — o módulo não importa mais o ensure de anunciante", () => {
  it("nenhuma rota de conta dispara criação de anunciante", async () => {
    const app = buildApp();

    await request(app).post("/api/account/plans/eligibility").send({});
    await request(app).get("/api/account/boost-options");
    await request(app).get("/api/account/plans");

    expect(advertiserEnsure.ensureAdvertiserForUser).not.toHaveBeenCalled();
  });
});
