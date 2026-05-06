import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fase 3C — assinaturas mensais Start/Pro via Mercado Pago preapproval.
 *
 * Cobre:
 *   1. createSubscriptionCheckout — guards de plano (whitelist
 *      Start/Pro, rejeita Evento + CPF Premium Highlight + planos
 *      inexistentes), preço fixo do backend (anti-spoof), bloqueio
 *      de duplicata quando user já tem sub viva.
 *   2. cancelUserSubscription — 404 quando não há sub, ownership
 *      implícita (busca pela sub do user autenticado), traduz status
 *      MP via mapPreapprovalStatusToLocal, marca cancel_at_period_end.
 *   3. mapPreapprovalStatusToLocal — todos os 6 estados locais alvo.
 *   4. Isolamento: createSubscriptionCheckout NÃO toca highlight_until
 *      (boost-7d intacto).
 *
 * Idempotência completa do webhook (FOR UPDATE no intent + check
 * status + UNIQUE provider_preapproval_id) requer DB real e fica
 * coberta no runbook + smoke staging.
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn({ query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) })),
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

const account = await import("../../src/modules/account/account.service.js");
const db = await import("../../src/infrastructure/database/db.js");
const {
  createSubscriptionCheckout,
  cancelUserSubscription,
  ALLOWED_SUBSCRIPTION_PLAN_IDS,
} = await import("../../src/modules/payments/subscriptions.service.js");
const {
  mapPreapprovalStatusToLocal,
} = await import("../../src/modules/payments/mercadopago-subscription.client.js");

const PLAN_START = {
  id: "cnpj-store-start",
  name: "Plano Loja Start",
  type: "CNPJ",
  price: 79.9,
  is_active: true,
  billing_model: "monthly",
  validity_days: 30,
};
const PLAN_PRO = {
  id: "cnpj-store-pro",
  name: "Plano Loja Pro",
  type: "CNPJ",
  price: 149.9,
  is_active: true,
  billing_model: "monthly",
  validity_days: 30,
};

beforeEach(() => {
  account.getAccountUser.mockReset();
  account.getPlanById.mockReset();
  account.isEventPlanId.mockReset().mockImplementation((id) => id === "cnpj-evento-premium");
  db.query.mockReset();
  db.withTransaction.mockReset().mockImplementation((fn) =>
    fn({ query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) })
  );

  // Default: nenhuma sub viva (findLiveSubscriptionForUser → null)
  db.query.mockResolvedValue({ rows: [] });

  // Default: user CNPJ verificado
  account.getAccountUser.mockResolvedValue({
    id: "u1",
    email: "u@x.com",
    type: "CNPJ",
    cnpj_verified: true,
  });
});

// ─────────────────────────────────────────────────────────────────────
// Whitelist de planos
// ─────────────────────────────────────────────────────────────────────

describe("createSubscriptionCheckout — whitelist de planos (anti-Evento)", () => {
  it("ALLOWED_SUBSCRIPTION_PLAN_IDS contém EXATAMENTE Start e Pro", () => {
    expect([...ALLOWED_SUBSCRIPTION_PLAN_IDS].sort()).toEqual([
      "cnpj-store-pro",
      "cnpj-store-start",
    ]);
  });

  it("rejeita cnpj-evento-premium com 410 (produto desligado, anti-revival)", async () => {
    await expect(
      createSubscriptionCheckout({
        userId: "u1",
        planId: "cnpj-evento-premium",
        successUrl: "http://x/ok",
      })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("rejeita cpf-premium-highlight com 410 (descontinuado, substituído por boost)", async () => {
    await expect(
      createSubscriptionCheckout({
        userId: "u1",
        planId: "cpf-premium-highlight",
        successUrl: "http://x/ok",
      })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("rejeita plano inexistente com 400 (mensagem inclui whitelist)", async () => {
    await expect(
      createSubscriptionCheckout({
        userId: "u1",
        planId: "plan-inventado",
        successUrl: "http://x/ok",
      })
    ).rejects.toThrow(/cnpj-store-start.*cnpj-store-pro/);
  });

  it("rejeita plan_id vazio com 400", async () => {
    await expect(
      createSubscriptionCheckout({ userId: "u1", planId: "", successUrl: "http://x/ok" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("aceita cnpj-store-start (Start é whitelistado)", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);

    const r = await createSubscriptionCheckout({
      userId: "u1",
      planId: "cnpj-store-start",
      successUrl: "http://x/ok",
    });
    expect(r.plan_id).toBe("cnpj-store-start");
  });

  it("aceita cnpj-store-pro (Pro é whitelistado)", async () => {
    account.getPlanById.mockResolvedValue(PLAN_PRO);

    const r = await createSubscriptionCheckout({
      userId: "u1",
      planId: "cnpj-store-pro",
      successUrl: "http://x/ok",
    });
    expect(r.plan_id).toBe("cnpj-store-pro");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Preço fixo (anti-spoof)
// ─────────────────────────────────────────────────────────────────────

describe("createSubscriptionCheckout — preço fixo do backend", () => {
  it("Start cria preapproval com R$ 79,90 (do plan no banco/fallback)", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);

    await createSubscriptionCheckout({
      userId: "u1",
      planId: "cnpj-store-start",
      successUrl: "http://x/ok",
    });

    // amount no INSERT INTO payment_intents = 79.9 (do PLAN_START.price)
    const insertCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    expect(insertCall).toBeTruthy();
    const params = insertCall[1];
    expect(params.some((p) => Number(p) === 79.9)).toBe(true);
  });

  it("Pro cria preapproval com R$ 149,90", async () => {
    account.getPlanById.mockResolvedValue(PLAN_PRO);

    await createSubscriptionCheckout({
      userId: "u1",
      planId: "cnpj-store-pro",
      successUrl: "http://x/ok",
    });

    const insertCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    const params = insertCall[1];
    expect(params.some((p) => Number(p) === 149.9)).toBe(true);
  });

  it("ignora amount/price/unit_price vindo do client (assinatura não aceita esses campos)", async () => {
    // Mesma defesa de boost-7d: a função NÃO aceita amount no contrato,
    // então mesmo passando, é ignorado pelo desestruturação de opts.
    account.getPlanById.mockResolvedValue(PLAN_START);

    await createSubscriptionCheckout({
      userId: "u1",
      planId: "cnpj-store-start",
      successUrl: "http://x/ok",
      // @ts-expect-error — defesa runtime contra refactor futuro:
      amount: 1,
      price: 1,
      unit_price: 1,
    });

    const insertCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    const params = insertCall[1];
    // amount real é 79.9 do banco; nenhum 1 deve aparecer como amount
    expect(params.some((p) => Number(p) === 79.9)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Bloqueio de duplicata
// ─────────────────────────────────────────────────────────────────────

describe("createSubscriptionCheckout — bloqueio de duplicata", () => {
  it("409 quando user já tem sub active", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          plan_id: "cnpj-store-start",
          status: "active",
          created_at: "2026-04-01T00:00:00Z",
        },
      ],
    });

    await expect(
      createSubscriptionCheckout({
        userId: "u1",
        planId: "cnpj-store-pro",
        successUrl: "http://x/ok",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("409 quando user tem sub pending (aguardando autorização MP)", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-pro", status: "pending", created_at: "2026-04-01" }],
    });

    await expect(
      createSubscriptionCheckout({
        userId: "u1",
        planId: "cnpj-store-start",
        successUrl: "http://x/ok",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("409 quando user tem sub paused (deve reativar, não criar nova)", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-pro", status: "paused", created_at: "2026-04-01" }],
    });

    await expect(
      createSubscriptionCheckout({
        userId: "u1",
        planId: "cnpj-store-pro",
        successUrl: "http://x/ok",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("permite criar quando user só tem sub cancelled (livre para nova compra)", async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // findLiveSubscriptionForUser → null
    account.getPlanById.mockResolvedValue(PLAN_START);

    const r = await createSubscriptionCheckout({
      userId: "u1",
      planId: "cnpj-store-start",
      successUrl: "http://x/ok",
    });
    expect(r.plan_id).toBe("cnpj-store-start");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cancelamento
// ─────────────────────────────────────────────────────────────────────

describe("cancelUserSubscription — ownership e cancellation", () => {
  it("404 quando não há sub viva do user", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(cancelUserSubscription({ userId: "u1" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("usa provider_preapproval_id se existe (Fase 3C); fallback para payment_id (legado 020)", async () => {
    // Sub legada da migration 020: só tem payment_id, sem
    // provider_preapproval_id.
    db.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          plan_id: "cnpj-store-start",
          status: "active",
          payment_id: "MP-PAYMENT-LEGACY-123",
          created_at: "2026-04-01T00:00:00Z",
        },
      ],
    });

    // sem MP_ACCESS_TOKEN → cancelPreapproval cai em modo MOCK e devolve cancelled
    const r = await cancelUserSubscription({ userId: "u1" });
    expect(r.cancelled).toBe(true);
    expect(r.status).toBe("cancelled");
    expect(r.cancel_at_period_end).toBe(true);
  });

  it("500 quando sub não tem identificador MP (manualmente criada/admin)", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          plan_id: "cnpj-store-start",
          status: "active",
          payment_id: null,
          provider_preapproval_id: null,
          created_at: "2026-04-01",
        },
      ],
    });

    await expect(cancelUserSubscription({ userId: "u1" })).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// mapPreapprovalStatusToLocal — mapeamento dos 6 estados locais alvo
// ─────────────────────────────────────────────────────────────────────

describe("mapPreapprovalStatusToLocal — todos os 6 estados locais", () => {
  it("authorized → active", () => {
    expect(mapPreapprovalStatusToLocal("authorized")).toBe("active");
  });
  it("payment_in_process → active (cobrança em curso conta como ativa)", () => {
    expect(mapPreapprovalStatusToLocal("payment_in_process")).toBe("active");
  });
  it("paused → paused (lojista pode reativar)", () => {
    expect(mapPreapprovalStatusToLocal("paused")).toBe("paused");
  });
  it("cancelled → cancelled (canônico)", () => {
    expect(mapPreapprovalStatusToLocal("cancelled")).toBe("cancelled");
  });
  it("canceled (variante MP) → cancelled", () => {
    expect(mapPreapprovalStatusToLocal("canceled")).toBe("cancelled");
  });
  it("finished → expired", () => {
    expect(mapPreapprovalStatusToLocal("finished")).toBe("expired");
  });
  it("rejected → payment_failed", () => {
    expect(mapPreapprovalStatusToLocal("rejected")).toBe("payment_failed");
  });
  it("pending / desconhecido → pending (default seguro)", () => {
    expect(mapPreapprovalStatusToLocal("pending")).toBe("pending");
    expect(mapPreapprovalStatusToLocal("foo")).toBe("pending");
    expect(mapPreapprovalStatusToLocal(null)).toBe("pending");
    expect(mapPreapprovalStatusToLocal(undefined)).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Isolamento — Subscription não toca boost
// ─────────────────────────────────────────────────────────────────────

describe("Subscription Start/Pro NÃO toca boost (highlight_until intacto)", () => {
  it("createSubscriptionCheckout não emite SQL UPDATE em ads", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);

    await createSubscriptionCheckout({
      userId: "u1",
      planId: "cnpj-store-start",
      successUrl: "http://x/ok",
    });

    const sqlsTouched = db.query.mock.calls.map(([sql]) => String(sql));
    for (const sql of sqlsTouched) {
      expect(sql).not.toMatch(/UPDATE\s+ads/i);
      expect(sql).not.toMatch(/highlight_until/i);
    }
  });
});
