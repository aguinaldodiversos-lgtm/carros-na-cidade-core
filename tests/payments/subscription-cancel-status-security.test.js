import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  findPaid: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../src/modules/payments/mercadopago-subscription.client.js", () => ({
  cancelPreapproval: mocks.cancel,
  mapPreapprovalStatusToLocal: (status) =>
    ["canceled", "cancelled"].includes(String(status)) ? "cancelled" : "pending",
}));
vi.mock("../../src/modules/payments/payments.service.js", () => ({
  createPlanSubscription: vi.fn(),
}));
vi.mock("../../src/modules/payments/subscriptions.guards.js", () => ({
  findLivePaidSubscriptionForUser: mocks.findPaid,
  findLiveSubscriptionForUser: vi.fn(),
  assertNoLiveSubscriptionFor: vi.fn(),
  assertSubscribablePlan: vi.fn(),
}));
vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: mocks.withTransaction,
  pool: { query: vi.fn() },
}));

const { cancelUserSubscription } = await import(
  "../../src/modules/payments/subscriptions.service.js"
);

const subscription = {
  user_id: "shop-42",
  plan_id: "cnpj-store-pro",
  status: "active",
  provider_preapproval_id: "PRE-42",
  payment_id: null,
  current_period_end: "2026-12-01T00:00:00.000Z",
  created_at: "2026-10-23T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findPaid.mockResolvedValue(subscription);
  mocks.cancel.mockResolvedValue({ status: "cancelled" });
  mocks.withTransaction.mockImplementation((fn) =>
    fn({ query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) })
  );
});

describe("cancelamento de assinatura — confirmação do provedor", () => {
  it("status authorized/pending não cancela a assinatura local nem informa sucesso", async () => {
    mocks.cancel.mockResolvedValueOnce({ status: "authorized" });

    await expect(cancelUserSubscription({ userId: "shop-42" })).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(mocks.cancel).toHaveBeenCalledWith("PRE-42");
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("falha do Mercado Pago não produz mutação local", async () => {
    mocks.cancel.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(cancelUserSubscription({ userId: "shop-42" })).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("retorno cancelled com update de uma linha preserva a validade contratada", async () => {
    const result = await cancelUserSubscription({ userId: "shop-42" });
    expect(result).toMatchObject({
      cancelled: true,
      plan_id: "cnpj-store-pro",
      status: "cancelled",
      cancel_at_period_end: true,
      expires_at: "2026-12-01T00:00:00.000Z",
    });
    expect(mocks.cancel).toHaveBeenCalledWith("PRE-42");
    expect(mocks.withTransaction).toHaveBeenCalledTimes(1);
  });
});
