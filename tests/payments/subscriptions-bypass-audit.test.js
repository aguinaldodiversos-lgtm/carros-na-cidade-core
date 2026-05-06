import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * AUDIT — Fase 3C, pré-sandbox.
 *
 * Garante que NÃO existe rota lateral permitindo assinatura de planos
 * fora da whitelist. Se algum dia alguém adicionar um endpoint novo
 * que chame `createPlanSubscription` direto sem passar por
 * `createSubscriptionCheckout`, os guards do service base ainda
 * BARRAM Evento Premium / CPF Premium Highlight / plano fake /
 * duplicata.
 *
 * Estrutura:
 *   1. Confirma que createPlanSubscription (legacy/service base) tem
 *      todos os 4 guards aplicados.
 *   2. Confirma simetria entre createSubscriptionCheckout (rota nova)
 *      e createPlanSubscription (rota legacy POST /subscription).
 *   3. Confirma que createPlanCheckout (one-time, rota /create) NÃO
 *      pode ser usado para virar canal de assinatura.
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
  isEventPlanId: vi.fn((id) => id === "cnpj-evento-premium"),
  listBoostOptions: vi.fn(() => []),
}));

vi.mock("../../src/shared/config/features.js", () => ({
  isEventsDomainEnabled: vi.fn(() => false),
}));

const account = await import("../../src/modules/account/account.service.js");
const db = await import("../../src/infrastructure/database/db.js");
const { createPlanSubscription, createPlanCheckout } = await import(
  "../../src/modules/payments/payments.service.js"
);
const { createSubscriptionCheckout } = await import(
  "../../src/modules/payments/subscriptions.service.js"
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

const PLAN_PRO = {
  id: "cnpj-store-pro",
  name: "Plano Loja Pro",
  type: "CNPJ",
  price: 149.9,
  is_active: true,
  billing_model: "monthly",
  validity_days: 30,
};

const PLAN_EVENTO_FAKE_MONTHLY = {
  id: "cnpj-evento-premium",
  name: "Plano Evento Premium",
  type: "CNPJ",
  price: 999.9,
  is_active: true, // simulando admin que reativou
  billing_model: "monthly",
  validity_days: 30,
};

const PLAN_CPF_PREMIUM_FAKE_MONTHLY = {
  id: "cpf-premium-highlight",
  name: "Plano Destaque Premium",
  type: "CPF",
  price: 79.9,
  is_active: true,
  billing_model: "monthly", // simulando admin que mudou de one_time
  validity_days: 30,
};

beforeEach(() => {
  account.getAccountUser.mockReset().mockResolvedValue({
    id: "u1",
    email: "u@x.com",
    type: "CNPJ",
    cnpj_verified: true,
  });
  account.getPlanById.mockReset();
  db.query.mockReset().mockResolvedValue({ rows: [] }); // sem sub viva por default
  db.withTransaction.mockReset().mockImplementation((fn) =>
    fn({ query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) })
  );
});

// ─────────────────────────────────────────────────────────────────────
// 1. createPlanSubscription (service base, alimentado por POST /subscription
//    legacy + qualquer outro consumidor) tem MESMOS guards.
// ─────────────────────────────────────────────────────────────────────

describe("AUDIT — createPlanSubscription (legacy POST /subscription)", () => {
  it("REJEITA cnpj-evento-premium com 410 mesmo se admin tornar is_active=true + monthly", async () => {
    account.getPlanById.mockResolvedValue(PLAN_EVENTO_FAKE_MONTHLY);

    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-evento-premium" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("REJEITA cpf-premium-highlight com 410 mesmo se admin mudar billing_model=monthly", async () => {
    account.getPlanById.mockResolvedValue(PLAN_CPF_PREMIUM_FAKE_MONTHLY);

    await expect(
      createPlanSubscription({ userId: "u1", planId: "cpf-premium-highlight" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("REJEITA plano fora da whitelist com 400 (mensagem cita Start/Pro)", async () => {
    account.getPlanById.mockResolvedValue({
      id: "plan-fake",
      type: "CNPJ",
      price: 99.9,
      is_active: true,
      billing_model: "monthly",
      validity_days: 30,
    });

    await expect(
      createPlanSubscription({ userId: "u1", planId: "plan-fake" })
    ).rejects.toThrow(/cnpj-store-start.*cnpj-store-pro/);
  });

  it("REJEITA criar 2ª assinatura quando user tem sub active (409)", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);
    db.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          plan_id: "cnpj-store-pro",
          status: "active",
          created_at: "2026-04-01",
        },
      ],
    });

    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-store-start" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("REJEITA criar 2ª assinatura quando user tem sub pending/paused (409)", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);

    db.query.mockResolvedValueOnce({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-pro", status: "pending", created_at: "2026-04-01" }],
    });
    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-store-start" })
    ).rejects.toMatchObject({ statusCode: 409 });

    db.query.mockResolvedValueOnce({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-pro", status: "paused", created_at: "2026-04-01" }],
    });
    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-store-start" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("ACEITA cnpj-store-start quando whitelisted, sem sub viva, plano OK", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);

    const r = await createPlanSubscription({
      userId: "u1",
      planId: "cnpj-store-start",
      successUrl: "http://x/ok",
    });
    expect(r.plan_id).toBe("cnpj-store-start");
  });

  it("ACEITA cnpj-store-pro quando whitelisted, sem sub viva, plano OK", async () => {
    account.getPlanById.mockResolvedValue(PLAN_PRO);

    const r = await createPlanSubscription({
      userId: "u1",
      planId: "cnpj-store-pro",
      successUrl: "http://x/ok",
    });
    expect(r.plan_id).toBe("cnpj-store-pro");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Simetria entre rota nova e legacy.
// ─────────────────────────────────────────────────────────────────────

describe("AUDIT — simetria entre /subscriptions/checkout (nova) e /subscription (legacy)", () => {
  it("ambas rejeitam Evento Premium com 410", async () => {
    account.getPlanById.mockResolvedValue(PLAN_EVENTO_FAKE_MONTHLY);

    await expect(
      createSubscriptionCheckout({ userId: "u1", planId: "cnpj-evento-premium" })
    ).rejects.toMatchObject({ statusCode: 410 });

    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-evento-premium" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("ambas rejeitam CPF Premium Highlight com 410", async () => {
    account.getPlanById.mockResolvedValue(PLAN_CPF_PREMIUM_FAKE_MONTHLY);

    await expect(
      createSubscriptionCheckout({ userId: "u1", planId: "cpf-premium-highlight" })
    ).rejects.toMatchObject({ statusCode: 410 });

    await expect(
      createPlanSubscription({ userId: "u1", planId: "cpf-premium-highlight" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("ambas rejeitam duplicata com 409", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);

    db.query.mockResolvedValueOnce({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-pro", status: "active", created_at: "2026-04-01" }],
    });
    await expect(
      createSubscriptionCheckout({ userId: "u1", planId: "cnpj-store-start" })
    ).rejects.toMatchObject({ statusCode: 409 });

    db.query.mockResolvedValueOnce({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-pro", status: "active", created_at: "2026-04-01" }],
    });
    await expect(
      createPlanSubscription({ userId: "u1", planId: "cnpj-store-start" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("ambas rejeitam plano fake com 400", async () => {
    account.getPlanById.mockResolvedValue({
      id: "plan-fake",
      type: "CNPJ",
      price: 99,
      is_active: true,
      billing_model: "monthly",
      validity_days: 30,
    });

    await expect(
      createSubscriptionCheckout({ userId: "u1", planId: "plan-fake" })
    ).rejects.toThrow(/cnpj-store-start.*cnpj-store-pro/);

    await expect(
      createPlanSubscription({ userId: "u1", planId: "plan-fake" })
    ).rejects.toThrow(/cnpj-store-start.*cnpj-store-pro/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. createPlanCheckout (rota /create, ONE-TIME) NÃO pode virar canal
//    de assinatura — billing_model='monthly' é rejeitado lá.
// ─────────────────────────────────────────────────────────────────────

describe("AUDIT — createPlanCheckout (POST /create one-time) não vira canal de assinatura", () => {
  it("rejeita planos com billing_model='monthly' (Start/Pro vão obrigatoriamente para o fluxo de subscription)", async () => {
    account.getPlanById.mockResolvedValue(PLAN_START);

    await expect(
      createPlanCheckout({
        userId: "u1",
        planId: "cnpj-store-start",
        successUrl: "http://x/ok",
      })
    ).rejects.toThrow(/pagamento[s]?\s+\(one_time|apenas pagamento/i);
  });

  it("rejeita Pro também (mesma defesa)", async () => {
    account.getPlanById.mockResolvedValue(PLAN_PRO);

    await expect(
      createPlanCheckout({ userId: "u1", planId: "cnpj-store-pro" })
    ).rejects.toThrow(/pagamento[s]?\s+\(one_time|apenas pagamento/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. /planos pública — confirma que NÃO existe import/uso de
//    PlanCheckoutButton ou /api/payments/* nesta página.
// ─────────────────────────────────────────────────────────────────────

describe("AUDIT — /planos não chama nenhum endpoint MP", async () => {
  // Lê o conteúdo do page.tsx e valida invariantes via string match.
  // Sem render — é uma checagem estática rápida do código atual.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = path.resolve(
    process.cwd(),
    "frontend/app/planos/page.tsx"
  );
  const source = await fs.readFile(filePath, "utf-8");

  it("não importa PlanCheckoutButton (legacy)", () => {
    expect(source).not.toMatch(/PlanCheckoutButton/);
  });

  it("não importa fetchBackendJson para /api/payments", () => {
    expect(source).not.toMatch(/fetchBackendJson.*payments/);
  });

  it("não menciona /api/payments diretamente", () => {
    expect(source).not.toMatch(/\/api\/payments/);
  });

  it("não menciona mercadopago.com diretamente", () => {
    expect(source).not.toMatch(/mercadopago\.com/i);
  });
});
