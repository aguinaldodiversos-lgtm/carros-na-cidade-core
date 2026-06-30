import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * Fase 1 da recorrência: roteamento do webhook por tópico.
 * Verifica que cada tópico bate no endpoint/handler certo, que o pagamento
 * avulso (produção) segue intacto, e que tópico irrelevante recebe ACK 200.
 *
 * MP_ACCESS_TOKEN setado ANTES do import força o caminho real (fetch).
 * MP_WEBHOOK_SECRET ausente → verifyWebhookSignature aceita (foco é roteamento).
 */
const dbMock = { query: vi.fn(), withTransaction: vi.fn(), pool: { query: vi.fn() } };
vi.mock("../../src/infrastructure/database/db.js", () => dbMock);

let handleWebhookNotification;

beforeAll(async () => {
  process.env.MP_ACCESS_TOKEN = "TEST-routing-token";
  delete process.env.MP_WEBHOOK_SECRET;
  ({ handleWebhookNotification } = await import("../../src/modules/payments/payments.service.js"));
});

beforeEach(() => {
  dbMock.query.mockReset();
  dbMock.withTransaction.mockReset();
});

/** fetch que responde por URL — permite afirmar QUAL endpoint foi chamado. */
function stubFetchByUrl(routes) {
  const calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      calls.push(String(url));
      const entry = Object.entries(routes).find(([frag]) => String(url).includes(frag));
      const body = entry ? entry[1] : { id: "x", status: "unknown" };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      };
    })
  );
  return calls;
}

describe("webhook — roteamento por tópico (Fase 1)", () => {
  it("subscription_preapproval → GET /preapproval/{id}, resolve por provider_preapproval_id, applied:false", async () => {
    const calls = stubFetchByUrl({ "/preapproval/PRE-1": { id: "PRE-1", status: "authorized" } });
    dbMock.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          plan_id: "cnpj-store-pro",
          status: "active",
          provider_preapproval_id: "PRE-1",
          created_at: "2026-01-01",
        },
      ],
    });

    const res = await handleWebhookNotification({
      rawBody: JSON.stringify({ type: "subscription_preapproval", data: { id: "PRE-1" } }),
      signature: null,
      requestId: null,
      dataId: "PRE-1",
      traceRequestId: "t-pre",
    });

    expect(res).toMatchObject({
      topic: "subscription_preapproval",
      preapproval_id: "PRE-1",
      mp_status: "authorized",
      local_status: "active",
      resolved: true,
      applied: false,
    });
    expect(calls.some((u) => u.includes("/preapproval/PRE-1"))).toBe(true);
    expect(calls.some((u) => u.includes("/v1/payments"))).toBe(false); // não tocou pagamento
    expect(dbMock.withTransaction).not.toHaveBeenCalled(); // não mutou
  });

  it("subscription_authorized_payment → GET /authorized_payments/{id}, extrai preapproval_id, applied:false", async () => {
    const calls = stubFetchByUrl({
      "/authorized_payments/AP-1": {
        id: "AP-1",
        preapproval_id: "PRE-1",
        status: "processed",
        payment: { status: "approved" },
      },
    });
    dbMock.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          plan_id: "cnpj-store-pro",
          status: "active",
          provider_preapproval_id: "PRE-1",
          created_at: "2026-01-01",
        },
      ],
    });

    const res = await handleWebhookNotification({
      rawBody: JSON.stringify({ type: "subscription_authorized_payment", data: { id: "AP-1" } }),
      signature: null,
      requestId: null,
      dataId: "AP-1",
      traceRequestId: "t-ap",
    });

    expect(res).toMatchObject({
      topic: "subscription_authorized_payment",
      authorized_payment_id: "AP-1",
      preapproval_id: "PRE-1",
      ap_status: "processed",
      payment_status: "approved",
      resolved: true,
      applied: false,
    });
    expect(calls.some((u) => u.includes("/authorized_payments/AP-1"))).toBe(true);
    expect(dbMock.withTransaction).not.toHaveBeenCalled();
  });

  it("merchant_order → ACK 200 ignored, sem fetch e sem 401", async () => {
    const calls = stubFetchByUrl({});
    const res = await handleWebhookNotification({
      rawBody: JSON.stringify({
        topic: "merchant_order",
        resource: "https://api.mercadopago.com/merchant_orders/123",
      }),
      signature: null,
      requestId: null,
      dataId: null,
      topicHint: "merchant_order",
      traceRequestId: "t-mo",
    });

    expect(res).toEqual({ ok: true, ignored: true, reason: "irrelevant_topic" });
    expect(calls.length).toBe(0);
  });

  it("payment avulso (boost) → segue caminho de produção: GET /v1/payments/{id}, NÃO toca /preapproval", async () => {
    const calls = stubFetchByUrl({
      "/v1/payments/PAY-1": {
        id: "PAY-1",
        status: "approved",
        transaction_amount: 39.9,
        metadata: {},
        external_reference: null,
      },
    });
    dbMock.query.mockResolvedValue({ rows: [] }); // resolveIntentForWebhook → null

    const res = await handleWebhookNotification({
      rawBody: JSON.stringify({ type: "payment", data: { id: "PAY-1" } }),
      signature: null,
      requestId: null,
      dataId: "PAY-1",
      traceRequestId: "t-pay",
    });

    expect(res).toMatchObject({ ok: true, warning: "payment intent not found" });
    expect(calls.some((u) => u.includes("/v1/payments/PAY-1"))).toBe(true);
    expect(calls.some((u) => u.includes("/preapproval"))).toBe(false);
    expect(calls.some((u) => u.includes("/authorized_payments"))).toBe(false);
  });
});
