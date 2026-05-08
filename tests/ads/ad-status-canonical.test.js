import { describe, it, expect } from "vitest";
import {
  AD_STATUS,
  AD_STATUS_OWNER_OPERABLE,
  AD_STATUS_PUBLIC,
  AD_STATUS_VALUES,
  isKnownAdStatus,
} from "../../src/modules/ads/ads.canonical.constants.js";

describe("AD_STATUS — enum canônico de status de anúncio", () => {
  it("expõe os 4 status conhecidos pelo banco hoje", () => {
    expect(AD_STATUS.ACTIVE).toBe("active");
    expect(AD_STATUS.PAUSED).toBe("paused");
    expect(AD_STATUS.DELETED).toBe("deleted");
    expect(AD_STATUS.BLOCKED).toBe("blocked");
  });

  it("listagem pública só inclui ACTIVE", () => {
    expect([...AD_STATUS_PUBLIC]).toEqual([AD_STATUS.ACTIVE]);
  });

  it("dono pode operar entre ACTIVE e PAUSED — nada além", () => {
    expect([...AD_STATUS_OWNER_OPERABLE].sort()).toEqual(
      [AD_STATUS.ACTIVE, AD_STATUS.PAUSED].sort()
    );
  });

  it("isKnownAdStatus aceita os 4 e rejeita strings desconhecidas", () => {
    for (const v of AD_STATUS_VALUES) {
      expect(isKnownAdStatus(v)).toBe(true);
    }
    expect(isKnownAdStatus("archived")).toBe(false);
    expect(isKnownAdStatus("pending_review")).toBe(false);
    expect(isKnownAdStatus("")).toBe(false);
    expect(isKnownAdStatus(null)).toBe(false);
  });
});
