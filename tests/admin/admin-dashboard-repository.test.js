import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import {
  getOverview,
  getKpis,
} from "../../src/modules/admin/dashboard/admin-dashboard.repository.js";

describe("admin dashboard repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOverview", () => {
    it("calls 4 parallel queries and returns structured result", async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ total: 100, active: 80, paused: 10, deleted: 8, blocked: 2, highlighted: 5 }],
        })
        .mockResolvedValueOnce({ rows: [{ total: 50, active: 48, suspended: 1, blocked: 1 }] })
        .mockResolvedValueOnce({ rows: [{ total: 200, admins: 2, regular: 198 }] })
        .mockResolvedValueOnce({ rows: [{ total: 500 }] });

      const result = await getOverview();

      expect(result.ads.total).toBe(100);
      expect(result.ads.active).toBe(80);
      expect(result.ads.blocked).toBe(2);
      expect(result.advertisers.total).toBe(50);
      expect(result.users.total).toBe(200);
      expect(result.users.admins).toBe(2);
      expect(result.cities.total).toBe(500);
    });
  });

  describe("getKpis", () => {
    it("returns KPIs for default 30-day period", async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ count: 25 }] })
        .mockResolvedValueOnce({ rows: [{ count: 15 }] })
        .mockResolvedValueOnce({
          rows: [
            { total_approved: 5000, approved_count: 10, plan_revenue: 3000, boost_revenue: 2000 },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ name: "Sao Paulo", state: "SP", ads_count: 50 }] });

      const result = await getKpis({ periodDays: 30 });

      expect(result.period_days).toBe(30);
      expect(result.new_ads).toBe(25);
      expect(result.new_users).toBe(15);
      expect(result.revenue.total_approved).toBe(5000);
      expect(result.top_cities).toHaveLength(1);
    });
  });
});
