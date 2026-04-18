import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";

vi.mock("../../src/modules/admin/ads/admin-ads.repository.js", () => ({
  findById: vi.fn(),
  updateStatus: vi.fn(),
  updateHighlight: vi.fn(),
  updatePriority: vi.fn(),
  updateBlockedReason: vi.fn(),
  getAdMetrics: vi.fn(),
  getAdEvents: vi.fn(),
  listAds: vi.fn(),
}));

import * as repo from "../../src/modules/admin/ads/admin-ads.repository.js";
import {
  changeAdStatus,
  setAdPriority,
  grantManualBoost,
} from "../../src/modules/admin/ads/admin-ads.service.js";

describe("admin ads service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("changeAdStatus", () => {
    it("rejects invalid status", async () => {
      await expect(changeAdStatus("admin1", "1", "nonexistent")).rejects.toThrow(/Status inválido/);
    });

    it("rejects when ad not found", async () => {
      vi.mocked(repo.findById).mockResolvedValue(null);
      await expect(changeAdStatus("admin1", "999", "active")).rejects.toThrow(/não encontrado/);
    });

    it("blocks restoration of deleted ads", async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: "1", status: "deleted" });
      await expect(changeAdStatus("admin1", "1", "active")).rejects.toThrow(/deletados/);
    });

    it("successfully changes status and records audit", async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: "1", status: "active" });
      vi.mocked(repo.updateStatus).mockResolvedValue({ id: "1", status: "blocked" });

      const result = await changeAdStatus("admin1", "1", "blocked", "policy violation");

      expect(repo.updateStatus).toHaveBeenCalledWith("1", "blocked");
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: "admin1",
          action: "change_ad_status",
          targetType: "ad",
          targetId: "1",
        })
      );
      expect(result.status).toBe("blocked");
    });
  });

  describe("setAdPriority", () => {
    it("rejects priority out of range", async () => {
      await expect(setAdPriority("admin1", "1", 200)).rejects.toThrow(/Priority/);
      await expect(setAdPriority("admin1", "1", -5)).rejects.toThrow(/Priority/);
    });

    it("successfully updates priority", async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: "1", priority: 10 });
      vi.mocked(repo.updatePriority).mockResolvedValue({ id: "1", priority: 50 });

      const result = await setAdPriority("admin1", "1", 50);
      expect(result.priority).toBe(50);
    });
  });

  describe("grantManualBoost", () => {
    it("rejects invalid days", async () => {
      await expect(grantManualBoost("admin1", "1", 0)).rejects.toThrow(/Dias de boost/);
      await expect(grantManualBoost("admin1", "1", 500)).rejects.toThrow(/Dias de boost/);
    });

    it("rejects boost on deleted ad", async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: "1", status: "deleted" });
      await expect(grantManualBoost("admin1", "1", 7)).rejects.toThrow(/deletado ou bloqueado/);
    });

    it("successfully grants boost and records audit", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "1",
        status: "active",
        highlight_until: null,
        priority: 5,
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "1" });
      vi.mocked(repo.updatePriority).mockResolvedValue({ id: "1" });

      const result = await grantManualBoost("admin1", "1", 7, "promotional");

      expect(repo.updateHighlight).toHaveBeenCalled();
      expect(repo.updatePriority).toHaveBeenCalledWith("1", 13);
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "grant_manual_boost",
        })
      );
    });
  });
});
