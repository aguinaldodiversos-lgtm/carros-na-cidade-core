import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn(),
}));

vi.mock("../../src/modules/admin/advertisers/admin-advertisers.repository.js", () => ({
  findById: vi.fn(),
  updateStatus: vi.fn(),
  listAdvertisers: vi.fn(),
  getAdvertiserAds: vi.fn(),
}));

import * as repo from "../../src/modules/admin/advertisers/admin-advertisers.repository.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import {
  changeAdvertiserStatus,
  getAdvertiserById,
} from "../../src/modules/admin/advertisers/admin-advertisers.service.js";

describe("admin advertisers service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("changeAdvertiserStatus", () => {
    it("rejects invalid status", async () => {
      await expect(changeAdvertiserStatus("admin1", "1", "paused")).rejects.toThrow(
        /Status inválido/
      );
    });

    it("rejects when advertiser not found", async () => {
      vi.mocked(repo.findById).mockResolvedValue(null);
      await expect(changeAdvertiserStatus("admin1", "999", "active")).rejects.toThrow(
        /não encontrado/
      );
    });

    it("successfully suspends advertiser", async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: "1", status: "active" });
      vi.mocked(repo.updateStatus).mockResolvedValue({ id: "1", status: "suspended" });

      const result = await changeAdvertiserStatus("admin1", "1", "suspended", "review pending");

      expect(repo.updateStatus).toHaveBeenCalledWith("1", "suspended", "review pending");
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "change_advertiser_status",
          targetType: "advertiser",
        })
      );
      expect(result.status).toBe("suspended");
    });

    it("successfully reactivates advertiser", async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: "1", status: "suspended" });
      vi.mocked(repo.updateStatus).mockResolvedValue({ id: "1", status: "active" });

      const result = await changeAdvertiserStatus("admin1", "1", "active");
      expect(result.status).toBe("active");
    });
  });

  describe("getAdvertiserById", () => {
    it("throws when not found", async () => {
      vi.mocked(repo.findById).mockResolvedValue(null);
      await expect(getAdvertiserById("999")).rejects.toThrow(/não encontrado/);
    });

    it("returns advertiser when found", async () => {
      const adv = { id: "1", name: "Test Store", status: "active" };
      vi.mocked(repo.findById).mockResolvedValue(adv);
      const result = await getAdvertiserById("1");
      expect(result).toEqual(adv);
    });
  });
});
