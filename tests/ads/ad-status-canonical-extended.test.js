import { describe, it, expect } from "vitest";
import {
  AD_STATUS,
  AD_STATUS_PUBLIC,
  AD_STATUS_OWNER_OPERABLE,
  AD_STATUS_CAN_RECEIVE_BOOST,
  AD_STATUS_REQUIRES_ADMIN_ACTION,
  AD_STATUS_OWNER_HIDDEN_FROM_PUBLIC,
  AD_VISIBLE_STATUSES,
  AD_RISK_LEVEL,
  AD_RISK_LEVEL_VALUES,
  isValidAdStatus,
} from "../../src/shared/constants/status.js";

describe("AD_STATUS — enum canônico expandido (rodada antifraude)", () => {
  it("inclui todos os 9 status do contrato atual", () => {
    expect(AD_STATUS.DRAFT).toBe("draft");
    expect(AD_STATUS.PENDING_REVIEW).toBe("pending_review");
    expect(AD_STATUS.ACTIVE).toBe("active");
    expect(AD_STATUS.PAUSED).toBe("paused");
    expect(AD_STATUS.SOLD).toBe("sold");
    expect(AD_STATUS.EXPIRED).toBe("expired");
    expect(AD_STATUS.REJECTED).toBe("rejected");
    expect(AD_STATUS.DELETED).toBe("deleted");
    expect(AD_STATUS.BLOCKED).toBe("blocked");
  });

  it("AD_STATUS_PUBLIC contém SOMENTE active", () => {
    expect([...AD_STATUS_PUBLIC]).toEqual([AD_STATUS.ACTIVE]);
    expect([...AD_VISIBLE_STATUSES]).toEqual([AD_STATUS.ACTIVE]);
  });

  it("AD_STATUS_CAN_RECEIVE_BOOST contém SOMENTE active", () => {
    expect([...AD_STATUS_CAN_RECEIVE_BOOST]).toEqual([AD_STATUS.ACTIVE]);
  });

  it("AD_STATUS_REQUIRES_ADMIN_ACTION = [pending_review]", () => {
    expect([...AD_STATUS_REQUIRES_ADMIN_ACTION]).toEqual([
      AD_STATUS.PENDING_REVIEW,
    ]);
  });

  it("AD_STATUS_OWNER_HIDDEN_FROM_PUBLIC NÃO inclui ACTIVE nem DELETED", () => {
    expect(AD_STATUS_OWNER_HIDDEN_FROM_PUBLIC).not.toContain(AD_STATUS.ACTIVE);
    expect(AD_STATUS_OWNER_HIDDEN_FROM_PUBLIC).not.toContain(AD_STATUS.DELETED);
  });

  it("AD_STATUS_OWNER_OPERABLE inclui pending_review e rejected (dono pode visualizar/corrigir)", () => {
    expect(AD_STATUS_OWNER_OPERABLE).toContain(AD_STATUS.PENDING_REVIEW);
    expect(AD_STATUS_OWNER_OPERABLE).toContain(AD_STATUS.REJECTED);
    expect(AD_STATUS_OWNER_OPERABLE).not.toContain(AD_STATUS.DELETED);
    expect(AD_STATUS_OWNER_OPERABLE).not.toContain(AD_STATUS.BLOCKED);
  });

  it("AD_RISK_LEVEL tem 4 níveis", () => {
    expect([...AD_RISK_LEVEL_VALUES].sort()).toEqual(
      ["critical", "high", "low", "medium"].sort()
    );
    expect(AD_RISK_LEVEL.LOW).toBe("low");
    expect(AD_RISK_LEVEL.CRITICAL).toBe("critical");
  });

  it("isValidAdStatus aceita todos os 9 status e rejeita unknown", () => {
    for (const v of Object.values(AD_STATUS)) {
      expect(isValidAdStatus(v)).toBe(true);
    }
    expect(isValidAdStatus("archived")).toBe(false);
    expect(isValidAdStatus("foo")).toBe(false);
  });
});
