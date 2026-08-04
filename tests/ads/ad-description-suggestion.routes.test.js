/**
 * Contrato HTTP da sugestão de descrição (Fase 4.5).
 *
 * Cobre o que só aparece no nível da rota:
 *   • anônimo recebe 401 e o service NUNCA roda;
 *   • os dois rate limits disparam 429 (por rascunho e por usuário);
 *   • o balde é por USUÁRIO — um não consome a cota do outro;
 *   • falha da IA sai como 503 sem vazar motivo interno.
 *
 * Monta o router REAL de ads (com a ordem real authMiddleware → limiters →
 * controller), com os controllers pesados mockados para não tocar banco.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.RATE_LIMIT_AD_DESCRIPTION_USER_MAX = "10";
process.env.RATE_LIMIT_AD_DESCRIPTION_DRAFT_MAX = "3";

const generateDescriptionSuggestion = vi.fn();

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => {
  const auth = (req, res, next) => {
    const who = req.headers["x-test-user"];
    if (!who) return res.status(401).json({ success: false, error: "unauth" });
    req.user = { id: String(who), role: "user" };
    return next();
  };
  return { default: auth, authMiddleware: auth };
});

vi.mock("../../src/modules/ads/description-suggestion/ad-description.service.js", () => ({
  generateDescriptionSuggestion: (...args) => generateDescriptionSuggestion(...args),
  SUGGESTION_DEADLINE_MS: 15000,
}));

/**
 * Controllers pesados: só precisam existir para o router subir sem tocar
 * banco. Proxy em vez de lista de nomes — assim o teste não quebra quando
 * `ads.routes.js` passar a registrar mais um handler (foi o que aconteceu com
 * `semanticAutocomplete`).
 */
function stubController() {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        return (_req, res) => res.json({});
      },
      has: () => true,
    }
  );
}

vi.mock("../../src/modules/ads/ads.controller.js", () => stubController());
vi.mock("../../src/modules/ads/reports/ad-reports.controller.js", () => stubController());
vi.mock("../../src/modules/ads/autocomplete/ads-autocomplete.controller.js", () =>
  stubController()
);
vi.mock("../../src/modules/ads/ads-upload.middleware.js", () => ({
  adsPublishImageUpload: { array: () => (_req, _res, next) => next() },
}));
vi.mock("../../src/shared/cache/cache.middleware.js", () => ({
  cacheGet: () => (_req, _res, next) => next(),
}));

const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");
const adsRoutes = (await import("../../src/modules/ads/ads.routes.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/ads", adsRoutes);
  app.use(errorHandler);
  return app;
}

function post(app, user, body = {}) {
  const req = request(app).post("/api/ads/description-suggestion");
  if (user) req.set("x-test-user", user);
  return req.send(body);
}

/** Cada teste usa um usuário/rascunho novo — os limiters guardam estado em memória. */
let seq = 0;
function freshUser() {
  seq += 1;
  return `user-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  generateDescriptionSuggestion.mockResolvedValue({
    text: "Jeep Compass Longitude 2.0 2017, preto, câmbio automático e tração 4x4.",
    meta: { chars: 71, optionsUsed: 4 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("autenticação", () => {
  it("anônimo recebe 401 e o service não roda", async () => {
    const res = await post(buildApp(), null, { brandLabel: "Jeep" });

    expect(res.status).toBe(401);
    expect(generateDescriptionSuggestion).not.toHaveBeenCalled();
  });

  it("autenticado recebe 200 com a sugestão", async () => {
    const res = await post(buildApp(), freshUser(), { brandLabel: "Jeep", modelLabel: "COMPASS" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestion).toMatch(/Compass/);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("o id do usuário vem do token, não do corpo", async () => {
    const user = freshUser();
    await post(buildApp(), user, { userId: "admin-forjado", brandLabel: "Jeep" });

    expect(generateDescriptionSuggestion.mock.calls[0][0]).toMatchObject({ id: user });
  });
});

describe("rate limit", () => {
  it("dispara 429 no 4º pedido para o MESMO rascunho", async () => {
    const app = buildApp();
    const user = freshUser();
    const body = { draftId: "rascunho-a", brandLabel: "Jeep" };

    for (let i = 0; i < 3; i++) {
      expect((await post(app, user, body)).status).toBe(200);
    }

    const bloqueado = await post(app, user, body);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.message).toMatch(/sugest|anúncio/i);
    expect(generateDescriptionSuggestion).toHaveBeenCalledTimes(3);
  });

  it("dispara 429 por USUÁRIO ao passar de 10, mesmo trocando de rascunho", async () => {
    const app = buildApp();
    const user = freshUser();

    // 10 pedidos, cada um num rascunho diferente para não bater no balde de 3.
    for (let i = 0; i < 10; i++) {
      const res = await post(app, user, { draftId: `rascunho-${i}`, brandLabel: "Jeep" });
      expect(res.status, `pedido ${i + 1}`).toBe(200);
    }

    const bloqueado = await post(app, user, { draftId: "rascunho-novo", brandLabel: "Jeep" });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.message).toMatch(/limite de sugest/i);
  });

  it("o balde de um usuário não consome o do outro", async () => {
    const app = buildApp();
    const a = freshUser();
    const b = freshUser();
    const body = { draftId: "mesmo-rascunho", brandLabel: "Jeep" };

    for (let i = 0; i < 3; i++) await post(app, a, body);
    expect((await post(app, a, body)).status).toBe(429);

    expect((await post(app, b, body)).status).toBe(200);
  });

  it("429 não é cacheável", async () => {
    const app = buildApp();
    const user = freshUser();
    const body = { draftId: "rascunho-c", brandLabel: "Jeep" };

    for (let i = 0; i < 3; i++) await post(app, user, body);
    const bloqueado = await post(app, user, body);

    expect(bloqueado.headers["cache-control"]).toMatch(/no-store/);
  });
});

describe("erro da IA no contrato HTTP", () => {
  it("503 com mensagem genérica, sem vazar detalhe interno", async () => {
    const { AppError } = await import("../../src/shared/middlewares/error.middleware.js");
    generateDescriptionSuggestion.mockRejectedValue(
      new AppError(
        "Não foi possível gerar a sugestão agora. Escreva a descrição ou tente de novo em instantes.",
        503
      )
    );

    const res = await post(buildApp(), freshUser(), { brandLabel: "Jeep" });

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/Não foi possível gerar a sugestão agora/);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|ollama|openai|11434|stack/i);
  });

  it("erro cru não vira corpo de resposta (contrato do errorHandler)", async () => {
    generateDescriptionSuggestion.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:11434")
    );

    const res = await post(buildApp(), freshUser(), { brandLabel: "Jeep" });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|11434/);
  });
});
