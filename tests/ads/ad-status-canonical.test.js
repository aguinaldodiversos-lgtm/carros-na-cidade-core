import { describe, it, expect } from "vitest";
import {
  AD_STATUS,
  AD_STATUS_OWNER_OPERABLE,
  AD_STATUS_PUBLIC,
  AD_STATUS_VALUES,
  isKnownAdStatus,
} from "../../src/modules/ads/ads.canonical.constants.js";

/**
 * Atualizado em 2026-05-08 (rodada antifraude/moderação): o enum agora
 * inclui draft, pending_review, sold, expired, rejected — mantida a
 * compatibilidade dos asserts essenciais (ACTIVE/PAUSED/DELETED/BLOCKED).
 */

describe("AD_STATUS — enum canônico de status de anúncio", () => {
  it("expõe pelo menos os 4 status do banco baseline + os novos antifraude", () => {
    expect(AD_STATUS.ACTIVE).toBe("active");
    expect(AD_STATUS.PAUSED).toBe("paused");
    expect(AD_STATUS.DELETED).toBe("deleted");
    expect(AD_STATUS.BLOCKED).toBe("blocked");
    // novos
    expect(AD_STATUS.PENDING_REVIEW).toBe("pending_review");
    expect(AD_STATUS.REJECTED).toBe("rejected");
  });

  it("listagem pública só inclui ACTIVE", () => {
    expect([...AD_STATUS_PUBLIC]).toEqual([AD_STATUS.ACTIVE]);
  });

  it("AD_STATUS_OWNER_OPERABLE NÃO inclui DELETED nem BLOCKED", () => {
    expect(AD_STATUS_OWNER_OPERABLE).not.toContain(AD_STATUS.DELETED);
    expect(AD_STATUS_OWNER_OPERABLE).not.toContain(AD_STATUS.BLOCKED);
    // Mas DEVE incluir os estados normais que o dono enxerga no painel.
    expect(AD_STATUS_OWNER_OPERABLE).toContain(AD_STATUS.ACTIVE);
    expect(AD_STATUS_OWNER_OPERABLE).toContain(AD_STATUS.PAUSED);
  });

  it("isKnownAdStatus aceita os status do enum e rejeita strings desconhecidas", () => {
    for (const v of AD_STATUS_VALUES) {
      expect(isKnownAdStatus(v)).toBe(true);
    }
    // pending_review agora É conhecido (parte do enum).
    expect(isKnownAdStatus("pending_review")).toBe(true);
    // 'archived' continua não sendo válido.
    expect(isKnownAdStatus("archived")).toBe(false);
    expect(isKnownAdStatus("")).toBe(false);
    expect(isKnownAdStatus(null)).toBe(false);
  });
});
