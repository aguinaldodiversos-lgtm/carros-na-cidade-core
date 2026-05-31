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
  setAdHighlight,
} from "../../src/modules/admin/ads/admin-ads.service.js";

const VALID_REASON = "Campanha promocional aprovada";

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
      await expect(grantManualBoost("admin1", "1", 0, VALID_REASON)).rejects.toThrow(
        /Dias de boost/
      );
      await expect(grantManualBoost("admin1", "1", 500, VALID_REASON)).rejects.toThrow(
        /Dias de boost/
      );
    });

    it("rejects boost on deleted ad", async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: "1", status: "deleted" });
      await expect(grantManualBoost("admin1", "1", 7, VALID_REASON)).rejects.toThrow(
        /deletado ou bloqueado/
      );
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

      await grantManualBoost("admin1", "1", 7, "promotional");

      expect(repo.updateHighlight).toHaveBeenCalled();
      expect(repo.updatePriority).toHaveBeenCalledWith("1", 13);
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "grant_manual_boost",
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────
  // Fase 3.2 — reason obrigatório em ações sensíveis de destaque
  // ───────────────────────────────────────────────────────────
  describe("grantManualBoost — reason obrigatório (Fase 3.2)", () => {
    it("rejeita reason ausente (null) com 400 ANTES de qualquer mutação", async () => {
      await expect(grantManualBoost("admin1", "1", 7, null)).rejects.toThrow(/Motivo obrigatório/);
      expect(repo.findById).not.toHaveBeenCalled();
      expect(repo.updateHighlight).not.toHaveBeenCalled();
      expect(repo.updatePriority).not.toHaveBeenCalled();
      expect(recordAdminAction).not.toHaveBeenCalled();
    });

    it("rejeita reason undefined", async () => {
      await expect(grantManualBoost("admin1", "1", 7, undefined)).rejects.toThrow(
        /Motivo obrigatório/
      );
      expect(recordAdminAction).not.toHaveBeenCalled();
    });

    it("rejeita reason vazio / só whitespace", async () => {
      await expect(grantManualBoost("admin1", "1", 7, "")).rejects.toThrow(/Motivo obrigatório/);
      await expect(grantManualBoost("admin1", "1", 7, "   ")).rejects.toThrow(/Motivo obrigatório/);
      await expect(grantManualBoost("admin1", "1", 7, "\t\n ")).rejects.toThrow(
        /Motivo obrigatório/
      );
    });

    it("rejeita reason mais curto que o mínimo (3 chars)", async () => {
      await expect(grantManualBoost("admin1", "1", 7, "ok")).rejects.toThrow(/mínimo 3/);
      expect(recordAdminAction).not.toHaveBeenCalled();
    });

    it("rejeita reason não-string (number, object)", async () => {
      await expect(grantManualBoost("admin1", "1", 7, 42)).rejects.toThrow(/Motivo obrigatório/);
      await expect(grantManualBoost("admin1", "1", 7, { reason: "x" })).rejects.toThrow(
        /Motivo obrigatório/
      );
    });

    it("aceita reason válido, persiste highlight e grava admin_actions com reason trimmed", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "82",
        status: "active",
        highlight_until: null,
        priority: 5,
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "82" });
      vi.mocked(repo.updatePriority).mockResolvedValue({ id: "82" });

      await grantManualBoost("admin1", "82", 7, "  Campanha aprovada  ");

      expect(repo.updateHighlight).toHaveBeenCalledTimes(1);
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "grant_manual_boost",
          targetType: "ad",
          targetId: "82",
          reason: "Campanha aprovada", // trimmed
          oldValue: expect.objectContaining({ highlight_until: null, priority: 5 }),
          newValue: expect.objectContaining({ days: 7, priority: 13 }),
        })
      );
    });

    it("trunca reason muito longo em 500 chars", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "1",
        status: "active",
        highlight_until: null,
        priority: 0,
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "1" });
      vi.mocked(repo.updatePriority).mockResolvedValue({ id: "1" });

      const longReason = "A".repeat(800);
      await grantManualBoost("admin1", "1", 7, longReason);

      const call = recordAdminAction.mock.calls[0][0];
      expect(call.reason.length).toBe(500);
    });
  });

  describe("setAdHighlight — reason obrigatório (Fase 3.2)", () => {
    it("rejeita set sem reason e NÃO altera highlight_until", async () => {
      await expect(
        setAdHighlight("admin1", "1", "2026-06-30T00:00:00.000Z", null)
      ).rejects.toThrow(/Motivo obrigatório/);
      expect(repo.updateHighlight).not.toHaveBeenCalled();
      expect(recordAdminAction).not.toHaveBeenCalled();
    });

    it("rejeita clear (highlight_until=null) sem reason", async () => {
      await expect(setAdHighlight("admin1", "1", null, "")).rejects.toThrow(/Motivo obrigatório/);
      expect(repo.updateHighlight).not.toHaveBeenCalled();
      expect(recordAdminAction).not.toHaveBeenCalled();
    });

    it("aceita set com reason válido, registra set_ad_highlight com old/new", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "1",
        status: "active",
        highlight_until: "2026-06-01T00:00:00.000Z",
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "1" });

      await setAdHighlight(
        "admin1",
        "1",
        "2026-06-30T00:00:00.000Z",
        "Ajuste comercial autorizado"
      );

      expect(repo.updateHighlight).toHaveBeenCalledWith("1", "2026-06-30T00:00:00.000Z");
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "set_ad_highlight",
          targetType: "ad",
          targetId: "1",
          reason: "Ajuste comercial autorizado",
          oldValue: { highlight_until: "2026-06-01T00:00:00.000Z" },
          newValue: { highlight_until: "2026-06-30T00:00:00.000Z" },
        })
      );
    });

    it("aceita clear com reason válido, registra clear_ad_highlight com old=valor, new=null", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "1",
        status: "active",
        highlight_until: "2026-06-01T00:00:00.000Z",
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "1" });

      await setAdHighlight("admin1", "1", null, "Revogação de destaque por suspeita");

      expect(repo.updateHighlight).toHaveBeenCalledWith("1", null);
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "clear_ad_highlight",
          targetType: "ad",
          targetId: "1",
          reason: "Revogação de destaque por suspeita",
          oldValue: { highlight_until: "2026-06-01T00:00:00.000Z" },
          newValue: { highlight_until: null },
        })
      );
    });

    it("set com reason válido em anúncio inativo: rejeita por status (não por reason)", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "1",
        status: "blocked",
        highlight_until: null,
      });
      await expect(
        setAdHighlight("admin1", "1", "2026-06-30T00:00:00.000Z", VALID_REASON)
      ).rejects.toThrow(/anúncios ativos podem ser destacados/);
      expect(recordAdminAction).not.toHaveBeenCalled();
    });
  });
});
