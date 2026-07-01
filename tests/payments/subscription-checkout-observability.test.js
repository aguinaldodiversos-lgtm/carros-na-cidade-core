import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Observabilidade (item A) — createPlanSubscription loga a causa real com
 * level error + requestId ANTES de propagar, tanto para FRONTEND_URL ausente
 * (getFrontendPublicUrl) quanto para erro do MP (mpRequest /preapproval),
 * re-lançando sem mudar status/lógica. Cria a linha action:
 * "payments.checkout.subscription".
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}));

vi.mock("../../src/modules/account/account.service.js", () => ({
  getAccountUser: vi.fn(),
  getOwnedAd: vi.fn(),
  getPlanById: vi.fn(),
  isEventPlanId: vi.fn((id) => id === "cnpj-evento-premium"),
  listBoostOptions: vi.fn(() => []),
}));

vi.mock("../../src/shared/config/features.js", () => ({
  isEventsDomainEnabled: vi.fn(() => false),
}));

// MP_ACCESS_TOKEN é capturado no import do módulo → setar ANTES do import
// para o caminho real (mpRequest) ter token.
process.env.MP_ACCESS_TOKEN = "TEST-token-obs";

const account = await import("../../src/modules/account/account.service.js");
const db = await import("../../src/infrastructure/database/db.js");
const { logger } = await import("../../src/shared/logger.js");
const { createPlanSubscription } = await import("../../src/modules/payments/payments.service.js");

const PLAN_PRO = {
  id: "cnpj-store-pro",
  name: "Plano Loja Pro",
  type: "CNPJ",
  price: 149.9,
  is_active: true,
  billing_model: "monthly",
  subscribable: true,
  validity_days: 30,
};

// Envs de URL controladas por teste (precedência determinística).
const URL_KEYS = [
  "MP_WEBHOOK_BASE_URL",
  "RENDER_EXTERNAL_URL",
  "BACKEND_API_URL",
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "FRONTEND_URL",
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PUBLIC_SITE_URL",
];
let savedEnv;

beforeEach(() => {
  vi.restoreAllMocks();
  account.getAccountUser.mockReset().mockResolvedValue({
    id: "u1",
    email: "u@x.com",
    type: "CNPJ",
    cnpj_verified: true,
  });
  account.getPlanById.mockReset().mockResolvedValue(PLAN_PRO);
  account.isEventPlanId.mockReset().mockImplementation((id) => id === "cnpj-evento-premium");
  db.query.mockReset().mockResolvedValue({ rows: [] });

  savedEnv = {};
  for (const k of URL_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  // Caminho real habilitado (live) — gate lê process.env em tempo de chamada.
  process.env.PAYMENTS_LIVE = "true";
  process.env.SUBSCRIPTIONS_LIVE = "true";
  // URL pública do BACKEND (para getWebhookNotificationUrl não falhar antes).
  process.env.RENDER_EXTERNAL_URL = "https://backend.onrender.com";
});

afterEach(() => {
  for (const k of URL_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  delete process.env.PAYMENTS_LIVE;
  delete process.env.SUBSCRIPTIONS_LIVE;
  vi.unstubAllGlobals();
});

describe("createPlanSubscription — observabilidade do checkout de assinatura", () => {
  it("FRONTEND_URL ausente → loga back_url_unresolved (error) e re-lança 500", async () => {
    // Nenhuma env de frontend setada → getFrontendPublicUrl lança 500.
    const errSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-store-pro", requestId: "req-1" })
    ).rejects.toMatchObject({ statusCode: 500 });

    const logged = errSpy.mock.calls.find(([o]) => o?.reason === "back_url_unresolved");
    expect(logged).toBeTruthy();
    expect(logged[0].requestId).toBe("req-1");
    expect(String(logged[1])).toMatch(/FRONTEND_URL|back_url/i);
  });

  it("erro do MP no /preapproval → loga preapproval_create_failed (error, upstreamStatus) e re-lança 502", async () => {
    process.env.FRONTEND_URL = "https://carrosnacidade.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => '{"message":"Invalid value for back_url, must be a valid URL"}',
      }))
    );
    const errSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-store-pro", requestId: "req-2" })
    ).rejects.toMatchObject({ statusCode: 502 });

    const logged = errSpy.mock.calls.find(([o]) => o?.reason === "preapproval_create_failed");
    expect(logged).toBeTruthy();
    expect(logged[0].requestId).toBe("req-2");
    expect(logged[0].upstreamStatus).toBe(400);
    expect(String(logged[0].err)).toMatch(/Mercado Pago error \(400\)/);
  });
});
