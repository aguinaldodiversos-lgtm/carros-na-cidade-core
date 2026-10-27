import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import {
  getPaymentsSummary,
  listPaymentIntents,
} from "../../src/modules/admin/payments/admin-payments.repository.js";

describe("admin payments summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista pagamentos associando ID integer do usuário a ID textual da intenção", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ id: "intent-1", user_id: "136", user_name: "Loja Exemplo" }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await listPaymentIntents({
      status: "approved",
      context: "plan",
      limit: 30,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.data[0].user_name).toBe("Loja Exemplo");
    expect(query).toHaveBeenCalledTimes(2);
    expect(vi.mocked(query).mock.calls[0][0]).toContain(
      "LEFT JOIN users u ON u.id::text = pi.user_id"
    );
    expect(vi.mocked(query).mock.calls[0][1]).toEqual(["approved", "plan", 30, 0]);
    expect(vi.mocked(query).mock.calls[1][1]).toEqual(["approved", "plan"]);
  });

  it("mantém fallback somente para tabela de pagamentos ausente (42P01)", async () => {
    vi.mocked(query).mockRejectedValueOnce(Object.assign(new Error("relation missing"), { code: "42P01" }));
    const result = await listPaymentIntents();
    expect(result).toEqual(
      expect.objectContaining({ data: [], total: 0, _warning: expect.any(String) })
    );
  });

  it("não mascara erro SQL inesperado como lista vazia de pagamentos", async () => {
    const databaseError = Object.assign(new Error("operator does not exist"), { code: "42883" });
    vi.mocked(query).mockRejectedValueOnce(databaseError);
    await expect(listPaymentIntents()).rejects.toBe(databaseError);
  });

  it("returns payment summary for given period", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          total_intents: 50,
          approved_count: 30,
          pending_count: 10,
          rejected_count: 5,
          canceled_count: 5,
          total_approved_amount: 15000.0,
          total_pending_amount: 3000.0,
          plan_approved_count: 20,
          boost_approved_count: 10,
          plan_approved_amount: 10000.0,
          boost_approved_amount: 5000.0,
        },
      ],
    });

    const result = await getPaymentsSummary({ periodDays: 30 });

    expect(result.total_intents).toBe(50);
    expect(result.approved_count).toBe(30);
    expect(result.total_approved_amount).toBe(15000.0);
    expect(result.plan_approved_amount).toBe(10000.0);
    expect(result.boost_approved_amount).toBe(5000.0);
  });

  it("returns safe fallback when table does not exist", async () => {
    vi.mocked(query).mockRejectedValueOnce(new Error("relation does not exist"));

    const result = await getPaymentsSummary({ periodDays: 30 });

    expect(result.total_intents).toBe(0);
    expect(result._warning).toBeTruthy();
  });
});
