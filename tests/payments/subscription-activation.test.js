import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fase 2 — ativação/renovação da assinatura recorrente.
 * Regras críticas: benefício só com approved+valor; idempotência dupla;
 * preço travado por vínculo ininterrupto; reconciliação de approved não-resolvido;
 * grandfathering; preapproval authorized não ativa.
 */

const dbMock = { query: vi.fn(), withTransaction: vi.fn(), pool: { query: vi.fn() } };
vi.mock("../../src/infrastructure/database/db.js", () => dbMock);

vi.mock("../../src/modules/payments/mercadopago-subscription.client.js", () => ({
  getPreapproval: vi.fn(),
  getAuthorizedPayment: vi.fn(),
  mapPreapprovalStatusToLocal: (s) => (s === "authorized" ? "active" : String(s)),
}));

const client = await import("../../src/modules/payments/mercadopago-subscription.client.js");
const db = await import("../../src/infrastructure/database/db.js");
const activation = await import("../../src/modules/payments/subscriptions.activation.js");
const webhook = await import("../../src/modules/payments/subscriptions.webhook.js");

/** Cliente de transação que retorna `rowsSeq[i]` em ordem e captura as queries. */
function txClient(rowsSeq = []) {
  const calls = [];
  let i = 0;
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql: String(sql), params });
    const r = rowsSeq[i] ?? { rows: [] };
    i += 1;
    return r;
  });
  return { client: { query }, calls };
}

beforeEach(() => {
  dbMock.query.mockReset().mockResolvedValue({ rows: [] });
  dbMock.withTransaction.mockReset();
  client.getPreapproval.mockReset();
  client.getAuthorizedPayment.mockReset();
});

// ───────────────────────── recordPaymentAndActivate ─────────────────────────

describe("recordPaymentAndActivate", () => {
  it("ativa: ledger + user_subscriptions active com contracted_amount/since + plan_id + aposenta grant", async () => {
    const { client: c, calls } = txClient([{ rows: [{ id: 1 }] }]); // ledger: pagamento NOVO
    db.withTransaction.mockImplementation(async (fn) => fn(c));

    const res = await activation.recordPaymentAndActivate({
      preapprovalId: "PRE-1",
      userId: "u1",
      planId: "cnpj-store-pro",
      authorizedPaymentId: "AP-1",
      amount: 149.9,
    });
    expect(res).toEqual({ activated: true });

    const sqls = calls.map((x) => x.sql);
    // 1) ledger idempotente
    expect(sqls[0]).toMatch(/INSERT INTO payments/);
    expect(sqls[0]).toMatch(/ON CONFLICT \(mercado_pago_id\) DO NOTHING/);
    // 2) upsert com preço contratado + provider + período mensal
    const upsert = sqls.find((s) => s.includes("INSERT INTO user_subscriptions"));
    expect(upsert).toMatch(/contracted_amount/);
    expect(upsert).toMatch(/contracted_price_since/);
    expect(upsert).toMatch(/provider_preapproval_id/);
    expect(upsert).toMatch(/INTERVAL '1 month'/);
    expect(upsert).toMatch(/ON CONFLICT \(provider_preapproval_id\)/);
    // RENOVAÇÃO PRESERVA PREÇO: o DO UPDATE não sobrescreve contracted_*
    const doUpdate = upsert.slice(upsert.indexOf("DO UPDATE"));
    expect(doUpdate).not.toMatch(/contracted_amount/);
    expect(doUpdate).not.toMatch(/contracted_price_since/);
    // valor real gravado
    const upsertCall = calls.find((x) => x.sql.includes("INSERT INTO user_subscriptions"));
    expect(upsertCall.params).toContain(149.9);
    // 3) liga peso
    expect(sqls.some((s) => /UPDATE users SET plan_id/.test(s))).toBe(true);
    // 4) aposenta cortesia
    const grantCall = calls.find((x) => /source = \$2 AND status IN/.test(x.sql));
    expect(grantCall).toBeTruthy();
    expect(grantCall.params).toContain("admin_grant");
  });

  it("idempotência: pagamento duplicado (ledger 0 linhas) NÃO reativa nem estende", async () => {
    const { client: c, calls } = txClient([{ rows: [] }]); // ledger: conflito (duplicado)
    db.withTransaction.mockImplementation(async (fn) => fn(c));

    const res = await activation.recordPaymentAndActivate({
      preapprovalId: "PRE-1",
      userId: "u1",
      planId: "cnpj-store-pro",
      authorizedPaymentId: "AP-1",
      amount: 149.9,
    });
    expect(res).toEqual({ activated: false, reason: "duplicate_payment" });
    // só o ledger foi tentado — nada de user_subscriptions/users/grant
    expect(calls.length).toBe(1);
    expect(calls[0].sql).toMatch(/INSERT INTO payments/);
  });

  it("nova assinatura = novo provider_preapproval_id → INSERT grava preço novo + relógio zerado (não herda)", async () => {
    const { client: c, calls } = txClient([{ rows: [{ id: 2 }] }]);
    db.withTransaction.mockImplementation(async (fn) => fn(c));

    await activation.recordPaymentAndActivate({
      preapprovalId: "PRE-NOVO",
      userId: "u1",
      planId: "cnpj-store-pro",
      authorizedPaymentId: "AP-NOVO",
      amount: 199.9, // preço vigente novo
    });
    const upsert = calls.find((x) => x.sql.includes("INSERT INTO user_subscriptions"));
    // idempotência é por provider_preapproval_id → preapproval novo = linha nova
    expect(upsert.params).toContain("PRE-NOVO");
    expect(upsert.params).toContain(199.9); // contracted_amount novo
    // contracted_price_since = NOW() no INSERT (relógio zerado)
    expect(upsert.sql).toMatch(/contracted_amount, contracted_price_since/);
  });
});

// ───────────────────────── recordUnresolvedApprovedPayment ─────────────────────────

describe("recordUnresolvedApprovedPayment", () => {
  it("INSERT em subscription_reconciliation ON CONFLICT (authorized_payment_id) DO NOTHING", async () => {
    await activation.recordUnresolvedApprovedPayment({
      authorizedPaymentId: "AP-9",
      preapprovalId: "PRE-9",
      amount: 149.9,
      reason: "intent_not_found",
      payload: { x: 1 },
    });
    const [sql, params] = db.query.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO subscription_reconciliation/);
    expect(String(sql)).toMatch(/ON CONFLICT \(authorized_payment_id\) DO NOTHING/);
    expect(params).toContain("AP-9");
    expect(params).toContain("intent_not_found");
  });
});

// ───────────────────────── handlers ─────────────────────────

describe("handleSubscriptionAuthorizedPaymentEvent", () => {
  it("approved + valor + intent → ATIVA", async () => {
    client.getAuthorizedPayment.mockResolvedValue({
      id: "AP-1",
      preapproval_id: "PRE-1",
      status: "processed",
      transaction_amount: 149.9,
      payment: { status: "approved" },
    });
    db.query.mockResolvedValue({ rows: [{ id: "i1", user_id: "u1", plan_id: "cnpj-store-pro" }] });
    db.withTransaction.mockImplementation(async (fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) })
    );

    const r = await webhook.handleSubscriptionAuthorizedPaymentEvent({
      authorizedPaymentId: "AP-1",
      traceRequestId: "t",
    });
    expect(r).toMatchObject({ applied: true, resolved: true, amount: 149.9 });
    expect(db.withTransaction).toHaveBeenCalled();
  });

  it("approved SEM valor → reconciliação (amount_missing), NÃO ativa", async () => {
    client.getAuthorizedPayment.mockResolvedValue({
      id: "AP-2",
      preapproval_id: "PRE-2",
      status: "processed",
      payment: { status: "approved" }, // sem transaction_amount
    });
    const r = await webhook.handleSubscriptionAuthorizedPaymentEvent({
      authorizedPaymentId: "AP-2",
      traceRequestId: "t",
    });
    expect(r).toMatchObject({ applied: false, reason: "amount_missing" });
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([s]) => /subscription_reconciliation/.test(String(s)))).toBe(
      true
    );
  });

  it("approved + valor mas intent não resolve → reconciliação (intent_not_found), NÃO ativa", async () => {
    client.getAuthorizedPayment.mockResolvedValue({
      id: "AP-3",
      preapproval_id: "PRE-3",
      status: "processed",
      transaction_amount: 149.9,
      payment: { status: "approved" },
    });
    db.query.mockResolvedValue({ rows: [] }); // findPlanIntent → null; e o INSERT de reconciliação
    const r = await webhook.handleSubscriptionAuthorizedPaymentEvent({
      authorizedPaymentId: "AP-3",
      traceRequestId: "t",
    });
    expect(r).toMatchObject({ applied: false, resolved: false, reason: "intent_not_found" });
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([s]) => /subscription_reconciliation/.test(String(s)))).toBe(
      true
    );
  });

  it("not_approved → só loga, NÃO ativa nem reconcilia", async () => {
    client.getAuthorizedPayment.mockResolvedValue({
      id: "AP-4",
      preapproval_id: "PRE-4",
      status: "processed",
      transaction_amount: 149.9,
      payment: { status: "rejected" },
    });
    const r = await webhook.handleSubscriptionAuthorizedPaymentEvent({
      authorizedPaymentId: "AP-4",
      traceRequestId: "t",
    });
    expect(r).toMatchObject({ applied: false, reason: "not_approved" });
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([s]) => /subscription_reconciliation/.test(String(s)))).toBe(
      false
    );
  });
});

describe("handleSubscriptionPreapprovalEvent", () => {
  it("authorized → vincula mas NÃO ativa (applied:false, sem withTransaction)", async () => {
    client.getPreapproval.mockResolvedValue({ id: "PRE-1", status: "authorized" });
    db.query.mockResolvedValue({ rows: [{ id: "i1", user_id: "u1", plan_id: "cnpj-store-pro" }] });
    const r = await webhook.handleSubscriptionPreapprovalEvent({
      preapprovalId: "PRE-1",
      traceRequestId: "t",
    });
    expect(r).toMatchObject({ applied: false, resolved: true, mp_status: "authorized" });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });
});
