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
  archiveAd: vi.fn(),
  restoreAd: vi.fn(),
}));

import * as repo from "../../src/modules/admin/ads/admin-ads.repository.js";
import {
  changeAdStatus,
  setAdPriority,
  grantManualBoost,
  setAdHighlight,
  archiveAd,
  restoreAd,
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

    it("successfully grants boost and records audit (sem alterar priority — Fase 3.3)", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "1",
        status: "active",
        highlight_until: null,
        priority: 5,
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "1" });

      await grantManualBoost("admin1", "1", 7, "promotional");

      expect(repo.updateHighlight).toHaveBeenCalled();
      // Fase 3.3: destaque NÃO mexe em priority — ranking detecta via highlight_until > NOW().
      expect(repo.updatePriority).not.toHaveBeenCalled();
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

    it("aceita reason válido, persiste highlight e grava admin_actions com reason trimmed (Fase 3.3: sem priority bump)", async () => {
      vi.mocked(repo.findById).mockResolvedValue({
        id: "82",
        status: "active",
        highlight_until: null,
        priority: 5,
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "82" });

      await grantManualBoost("admin1", "82", 7, "  Campanha aprovada  ");

      expect(repo.updateHighlight).toHaveBeenCalledTimes(1);
      // Fase 3.3: priority não é alterado (destaque entra na camada 4 via highlight_until).
      expect(repo.updatePriority).not.toHaveBeenCalled();
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "grant_manual_boost",
          targetType: "ad",
          targetId: "82",
          reason: "Campanha aprovada", // trimmed
          oldValue: expect.objectContaining({ highlight_until: null, priority: 5 }),
          newValue: expect.objectContaining({ days: 7, priority: 5 }), // preservado, não +8
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

      const longReason = "A".repeat(800);
      await grantManualBoost("admin1", "1", 7, longReason);

      const call = recordAdminAction.mock.calls[0][0];
      expect(call.reason.length).toBe(500);
    });

    // Fase 3.3 — regressão do bug priority=9
    it("destaque duplicado alonga prazo mas NÃO altera priority", async () => {
      // Anúncio JÁ destacado: highlight_until no futuro, priority manual=2
      const currentHighlight = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      vi.mocked(repo.findById).mockResolvedValue({
        id: "82",
        status: "active",
        highlight_until: currentHighlight,
        priority: 2,
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "82" });

      await grantManualBoost("admin1", "82", 7, "Renovação de campanha");

      // highlight_until somou +7 dias (alonga) sem mexer em priority
      expect(repo.updatePriority).not.toHaveBeenCalled();
      const updateCall = repo.updateHighlight.mock.calls[0];
      const persistedHighlight = new Date(updateCall[1]);
      const expected = new Date(new Date(currentHighlight).getTime() + 7 * 24 * 60 * 60 * 1000);
      expect(Math.abs(persistedHighlight.getTime() - expected.getTime())).toBeLessThan(2000);

      // newValue do audit preserva priority original
      const audit = recordAdminAction.mock.calls[0][0];
      expect(audit.newValue.priority).toBe(2);
    });

    it("anúncio com priority=1 e boost → newValue.priority continua 1 (não vira 9)", async () => {
      // Regressão direta do bug observado em #82: priority começou em 1, virou 9 após boost.
      vi.mocked(repo.findById).mockResolvedValue({
        id: "82",
        status: "active",
        highlight_until: null,
        priority: 1,
      });
      vi.mocked(repo.updateHighlight).mockResolvedValue({ id: "82" });

      await grantManualBoost("admin1", "82", 7, "Validação Fase 3.3");

      expect(repo.updatePriority).not.toHaveBeenCalled();
      const audit = recordAdminAction.mock.calls[0][0];
      expect(audit.newValue.priority).toBe(1);
      expect(audit.newValue.priority).not.toBe(9);
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

  // ──────────────────────────────────────────────────────────────────
  // Fase 3.5 — Arquivar / restaurar anúncio (preserva histórico)
  // ──────────────────────────────────────────────────────────────────
  describe("archiveAd — reason obrigatório (Fase 3.5)", () => {
    it("rejeita sem reason ANTES de qualquer leitura/escrita", async () => {
      await expect(archiveAd("admin1", "1", null)).rejects.toThrow(/Motivo obrigatório/);
      expect(repo.findById).not.toHaveBeenCalled();
      expect(repo.archiveAd).not.toHaveBeenCalled();
      expect(recordAdminAction).not.toHaveBeenCalled();
    });

    it("rejeita reason undefined/vazio/whitespace/curto", async () => {
      await expect(archiveAd("admin1", "1", undefined)).rejects.toThrow(/Motivo obrigatório/);
      await expect(archiveAd("admin1", "1", "")).rejects.toThrow(/Motivo obrigatório/);
      await expect(archiveAd("admin1", "1", "   ")).rejects.toThrow(/Motivo obrigatório/);
      await expect(archiveAd("admin1", "1", "ok")).rejects.toThrow(/mínimo 3/);
      expect(repo.archiveAd).not.toHaveBeenCalled();
    });

    it("rejeita 404 quando anúncio não existe (com reason válido)", async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce(null);
      await expect(archiveAd("admin1", "999", VALID_REASON)).rejects.toThrow(/não encontrado/);
      expect(repo.archiveAd).not.toHaveBeenCalled();
    });

    it("rejeita arquivar anúncio já deletado", async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce({ id: "1", status: "deleted" });
      await expect(archiveAd("admin1", "1", VALID_REASON)).rejects.toThrow(
        /deletado não pode ser arquivado/
      );
      expect(repo.archiveAd).not.toHaveBeenCalled();
    });

    it("idempotência: arquivar archived é no-op (sem repo.archiveAd, sem admin_action)", async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce({
        id: "1",
        status: "archived",
        archived_at: "2026-05-31T00:00:00Z",
      });
      const result = await archiveAd("admin1", "1", VALID_REASON);
      expect(repo.archiveAd).not.toHaveBeenCalled();
      expect(recordAdminAction).not.toHaveBeenCalled();
      expect(result.status).toBe("archived");
    });

    it("happy path: archiveAd grava status='archived' + archived_at + admin_action com old/new snapshot", async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce({
        id: "82",
        status: "active",
        highlight_until: "2026-06-01T00:00:00Z",
        priority: 3,
      });
      vi.mocked(repo.archiveAd).mockResolvedValueOnce({
        id: "82",
        status: "archived",
        archived_at: "2026-05-31T12:00:00Z",
        archived_by_user_id: "admin1",
        archive_reason: "Limpeza operacional",
      });

      const result = await archiveAd("admin1", "82", "  Limpeza operacional  ");

      expect(repo.archiveAd).toHaveBeenCalledWith("82", "admin1", "Limpeza operacional");
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "archive_ad",
          targetType: "ad",
          targetId: "82",
          reason: "Limpeza operacional",
          oldValue: expect.objectContaining({
            status: "active",
            highlight_until: "2026-06-01T00:00:00Z",
            priority: 3,
          }),
          newValue: expect.objectContaining({
            status: "archived",
            reason: "Limpeza operacional",
          }),
        })
      );
      expect(result.status).toBe("archived");
    });

    it("rejeita reason não-string (number, object)", async () => {
      await expect(archiveAd("admin1", "1", 42)).rejects.toThrow(/Motivo obrigatório/);
      await expect(archiveAd("admin1", "1", { reason: "x" })).rejects.toThrow(/Motivo obrigatório/);
    });
  });

  describe("restoreAd (Fase 3.5)", () => {
    it("rejeita sem reason", async () => {
      await expect(restoreAd("admin1", "1", null)).rejects.toThrow(/Motivo obrigatório/);
      expect(repo.restoreAd).not.toHaveBeenCalled();
    });

    it("rejeita status alvo inválido (ex: blocked, archived)", async () => {
      await expect(restoreAd("admin1", "1", VALID_REASON, "blocked")).rejects.toThrow(/inválido/);
      await expect(restoreAd("admin1", "1", VALID_REASON, "archived")).rejects.toThrow(/inválido/);
      expect(repo.restoreAd).not.toHaveBeenCalled();
    });

    it("rejeita quando anúncio não está archived (ex: active)", async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce({ id: "1", status: "active" });
      await expect(restoreAd("admin1", "1", VALID_REASON)).rejects.toThrow(/não está arquivado/);
      expect(repo.restoreAd).not.toHaveBeenCalled();
    });

    it("happy path: restore arquivado → ativo, registra admin_action restore_ad", async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce({
        id: "82",
        status: "archived",
        archived_at: "2026-05-31T12:00:00Z",
        archive_reason: "Limpeza operacional",
      });
      vi.mocked(repo.restoreAd).mockResolvedValueOnce({ id: "82", status: "active" });

      await restoreAd("admin1", "82", "Anunciante pediu retorno", "active");

      expect(repo.restoreAd).toHaveBeenCalledWith("82", "active");
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "restore_ad",
          targetType: "ad",
          targetId: "82",
          reason: "Anunciante pediu retorno",
          oldValue: expect.objectContaining({
            status: "archived",
            archive_reason: "Limpeza operacional",
          }),
          newValue: expect.objectContaining({ status: "active" }),
        })
      );
    });

    it("happy path: restore para paused também é permitido", async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce({ id: "82", status: "archived" });
      vi.mocked(repo.restoreAd).mockResolvedValueOnce({ id: "82", status: "paused" });
      await restoreAd("admin1", "82", VALID_REASON, "paused");
      expect(repo.restoreAd).toHaveBeenCalledWith("82", "paused");
      expect(recordAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "restore_ad",
          newValue: expect.objectContaining({ status: "paused" }),
        })
      );
    });
  });
});
