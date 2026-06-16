import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Fase 5.0 — integração do gate no payments.service.
 *
 * Prova que o gate unificado está REALMENTE conectado nos checkouts:
 *   - boost-7d e assinatura BLOQUEIAM cobrança real quando há token mas
 *     PAYMENTS_LIVE/sandbox está desligado (fix do R1);
 *   - assinatura exige o cadeado adicional SUBSCRIPTIONS_LIVE no caminho real;
 *   - mock continua funcionando quando não há token (dev/CI).
 *
 * Não testamos o caminho real "feliz" (chamada ao Mercado Pago) aqui — isso
 * exige fetch real/credencial e é coberto pelo smoke sandbox do runbook.
 * O que importa é que o BLOQUEIO acontece ANTES de qualquer mpRequest.
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) =>
    fn({ query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) })
  ),
  pool: { query: vi.fn() },
}));

vi.mock("../../src/modules/account/account.service.js", () => ({
  getAccountUser: vi.fn(),
  getOwnedAd: vi.fn(),
  getPlanById: vi.fn(),
  isEventPlanId: vi.fn(() => false),
  listBoostOptions: vi.fn(() => []),
}));

vi.mock("../../src/shared/config/features.js", () => ({
  isEventsDomainEnabled: vi.fn(() => false),
}));

vi.mock("../../src/modules/commercial/commercial-rules.service.js", () => ({
  getBoostOptions: vi.fn(() => [
    { id: "boost-7d", days: 7, price: 39.9, label: "Destaque por 7 dias" },
  ]),
  getCommercialRules: vi.fn(() => ({ allow_boost_cpf: true, allow_boost_cnpj: true })),
}));

const account = await import("../../src/modules/account/account.service.js");
const db = await import("../../src/infrastructure/database/db.js");
const { createBoostCheckout, createPlanSubscription } = await import(
  "../../src/modules/payments/payments.service.js"
);

const PLAN_START = {
  id: "cnpj-store-start",
  name: "Plano Loja Start",
  type: "CNPJ",
  price: 79.9,
  is_active: true,
  billing_model: "monthly",
  validity_days: 30,
};

// process.env é compartilhado — snapshot + restore por teste.
const GATE_ENV_KEYS = [
  "MP_ACCESS_TOKEN",
  "PAYMENTS_LIVE",
  "PAYMENTS_SANDBOX_ENABLED",
  "MERCADO_PAGO_ENV",
  "SUBSCRIPTIONS_LIVE",
];
let original = {};

beforeEach(() => {
  original = {};
  for (const key of GATE_ENV_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
  db.query.mockReset().mockResolvedValue({ rowCount: 1, rows: [] });
  account.getAccountUser.mockReset();
  account.getOwnedAd.mockReset();
  account.getPlanById.mockReset();
});

afterEach(() => {
  for (const key of GATE_ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

// ─────────────────────────────────────────────────────────────────────
// Boost-7d — fix do R1
// ─────────────────────────────────────────────────────────────────────

describe("createBoostCheckout respeita PAYMENTS_LIVE", () => {
  it("MP_ACCESS_TOKEN presente + PAYMENTS_LIVE=false → BLOQUEIA (403 PAYMENTS_NOT_LIVE)", async () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-secret";
    account.getAccountUser.mockResolvedValue({ id: "u1", type: "CPF" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1", title: "Civic", status: "active" });

    await expect(
      createBoostCheckout({ userId: "u1", adId: "ad1", boostOptionId: "boost-7d" })
    ).rejects.toMatchObject({ statusCode: 403, details: { code: "PAYMENTS_NOT_LIVE" } });

    // Nenhum payment_intents foi inserido — bloqueou antes de tocar banco/MP.
    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    expect(insert).toBeFalsy();
  });

  it("sem token → mock continua funcionando (init_point mock, sem cobrança)", async () => {
    account.getAccountUser.mockResolvedValue({ id: "u1", type: "CPF" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1", title: "Civic", status: "active" });

    const r = await createBoostCheckout({ userId: "u1", adId: "ad1", boostOptionId: "boost-7d" });
    expect(r.context).toBe("ad_boost");
    expect(r.init_point).toMatch(/mock=1/);
    // mock grava o intent localmente (status pending), mas não cobra.
    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    expect(insert).toBeTruthy();
  });

  it("token + sandbox autorizado → NÃO bloqueia no gate (segue para o caminho real)", async () => {
    process.env.MP_ACCESS_TOKEN = "TEST-xxxx";
    process.env.MERCADO_PAGO_ENV = "sandbox";
    process.env.PAYMENTS_SANDBOX_ENABLED = "true";
    account.getAccountUser.mockResolvedValue({ id: "u1", type: "CPF" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1", title: "Civic", status: "active" });

    // Em sandbox o fluxo passa do gate e chega no mpRequest real. Como o
    // token-const do módulo foi capturado vazio no import, mpRequest falha —
    // o que importa é que NÃO é o 403 PAYMENTS_NOT_LIVE do gate, provando que
    // o caminho sandbox foi liberado.
    const err = await createBoostCheckout({
      userId: "u1",
      adId: "ad1",
      boostOptionId: "boost-7d",
    }).then(
      () => null,
      (e) => e
    );
    expect(err).toBeTruthy();
    expect(err.details?.code).not.toBe("PAYMENTS_NOT_LIVE");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Assinatura — PAYMENTS_LIVE + SUBSCRIPTIONS_LIVE
// ─────────────────────────────────────────────────────────────────────

describe("createPlanSubscription respeita PAYMENTS_LIVE e SUBSCRIPTIONS_LIVE", () => {
  beforeEach(() => {
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      email: "u@x.com",
      type: "CNPJ",
      cnpj_verified: true,
    });
    account.getPlanById.mockResolvedValue(PLAN_START);
    // findLiveSubscriptionForUser → null (sem sub viva)
    db.query.mockResolvedValue({ rows: [] });
  });

  it("token + PAYMENTS_LIVE=false → BLOQUEIA no gate de pagamentos (403 PAYMENTS_NOT_LIVE)", async () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-secret";

    await expect(
      createPlanSubscription({
        userId: "u1",
        planId: "cnpj-store-start",
        successUrl: "http://x/ok",
      })
    ).rejects.toMatchObject({ statusCode: 403, details: { code: "PAYMENTS_NOT_LIVE" } });
  });

  it("token + PAYMENTS_LIVE=true mas SUBSCRIPTIONS_LIVE desligado → BLOQUEIA (403 SUBSCRIPTIONS_NOT_LIVE)", async () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-secret";
    process.env.PAYMENTS_LIVE = "true";

    await expect(
      createPlanSubscription({
        userId: "u1",
        planId: "cnpj-store-start",
        successUrl: "http://x/ok",
      })
    ).rejects.toMatchObject({ statusCode: 403, details: { code: "SUBSCRIPTIONS_NOT_LIVE" } });
  });

  it("sem token → mock continua funcionando (não exige SUBSCRIPTIONS_LIVE)", async () => {
    const r = await createPlanSubscription({
      userId: "u1",
      planId: "cnpj-store-start",
      successUrl: "http://x/ok",
    });
    expect(r.plan_id).toBe("cnpj-store-start");
    expect(r.init_point).toMatch(/mock=1/);
  });
});
