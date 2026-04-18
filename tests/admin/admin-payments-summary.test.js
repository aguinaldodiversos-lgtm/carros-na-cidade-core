import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import { getPaymentsSummary } from "../../src/modules/admin/payments/admin-payments.repository.js";

describe("admin payments summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
