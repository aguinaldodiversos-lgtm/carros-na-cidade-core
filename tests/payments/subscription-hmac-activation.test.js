import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * HMAC gate: um POST forjado (assinatura inválida) no tópico
 * subscription_authorized_payment recebe 401 e NUNCA ativa (não toca DB).
 *
 * MP_WEBHOOK_SECRET é capturado no import do módulo → setar ANTES do import.
 */
const dbMock = { query: vi.fn(), withTransaction: vi.fn(), pool: { query: vi.fn() } };
vi.mock("../../src/infrastructure/database/db.js", () => dbMock);

let handleWebhookNotification;

beforeAll(async () => {
  process.env.MP_ACCESS_TOKEN = "TEST-hmac-token";
  process.env.MP_WEBHOOK_SECRET = "top-secret-hmac";
  ({ handleWebhookNotification } = await import("../../src/modules/payments/payments.service.js"));
});

beforeEach(() => {
  dbMock.query.mockReset().mockResolvedValue({ rows: [] });
  dbMock.withTransaction.mockReset();
  vi.stubGlobal("fetch", vi.fn()); // não deve ser chamado
});

describe("HMAC — subscription_authorized_payment", () => {
  it("assinatura inválida → 401 e NÃO ativa (sem DB, sem fetch)", async () => {
    await expect(
      handleWebhookNotification({
        rawBody: JSON.stringify({ type: "subscription_authorized_payment", data: { id: "AP-1" } }),
        signature: "ts=1700000000,v1=deadbeefforged",
        requestId: "req-1",
        dataId: "AP-1",
        traceRequestId: "t",
      })
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(dbMock.withTransaction).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("assinatura ausente → 401 (não ativa)", async () => {
    await expect(
      handleWebhookNotification({
        rawBody: JSON.stringify({ type: "subscription_authorized_payment", data: { id: "AP-2" } }),
        signature: null,
        requestId: null,
        dataId: "AP-2",
        traceRequestId: "t",
      })
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(dbMock.withTransaction).not.toHaveBeenCalled();
  });
});
