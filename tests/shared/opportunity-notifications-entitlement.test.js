import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => {
  const query = vi.fn();
  return { query, default: { query }, pool: { query } };
});
const { query } = await import("../../src/infrastructure/database/db.js");
const { listDealerRecipientsByCity } = await import(
  "../../src/modules/purchase-intents/purchase-intents.repository.js"
);
const { PAID_OPPORTUNITY_SUBSCRIPTION_PREDICATE } = await import(
  "../../src/shared/middlewares/opportunities-entitlement.middleware.js"
);

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [{ user_id: "20" }, { user_id: "21" }] });
});

describe("destinatários da notificação Compradores Procurando", () => {
  it("preserva fan-out regional de todos os lojistas CNPJ na fase gratuita", async () => {
    expect(await listDealerRecipientsByCity(1)).toEqual(["20", "21"]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("adv.city_id = $1");
    expect(sql).toContain("document_type");
    expect(sql).not.toContain("user_subscriptions");
    expect(params[0]).toBe(1);
  });

  it("no modo pago, exige assinatura Pro vigente e comprovada na própria query", async () => {
    expect(await listDealerRecipientsByCity(1, { paidOnly: true })).toEqual(["20", "21"]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("EXISTS (");
    expect(sql).toContain("us.user_id = adv.user_id");
    expect(sql).toContain("us.plan_id = 'cnpj-store-pro'");
    expect(sql).toContain(PAID_OPPORTUNITY_SUBSCRIPTION_PREDICATE);
    expect(sql).toContain("us.last_payment_id");
    expect(sql).toContain("us.expires_at > NOW()");
    expect(params[0]).toBe(1);
  });

  it("falha sem emitir notificação quando banco não pode conferir assinatura", async () => {
    query.mockRejectedValueOnce(new Error("connection failure"));
    await expect(listDealerRecipientsByCity(1, { paidOnly: true })).rejects.toThrow(
      "connection failure"
    );
  });
});
