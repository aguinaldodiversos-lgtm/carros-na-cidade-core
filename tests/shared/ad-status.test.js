import { describe, it, expect } from "vitest";
import {
  AD_STATUS,
  PUBLIC_VISIBLE_STATUSES,
  DASHBOARD_VISIBLE_STATUSES,
  isPubliclyVisible,
  isDashboardVisible,
} from "../../src/shared/constants/ad-status.js";

describe("AD_STATUS constants", () => {
  it("define os quatro status canônicos", () => {
    expect(AD_STATUS.ACTIVE).toBe("active");
    expect(AD_STATUS.PAUSED).toBe("paused");
    expect(AD_STATUS.DELETED).toBe("deleted");
    expect(AD_STATUS.PENDING).toBe("pending");
  });

  it("catálogo público exibe apenas 'active'", () => {
    expect(PUBLIC_VISIBLE_STATUSES).toContain("active");
    expect(PUBLIC_VISIBLE_STATUSES).not.toContain("paused");
    expect(PUBLIC_VISIBLE_STATUSES).not.toContain("deleted");
  });

  it("dashboard exibe 'active' e 'paused'", () => {
    expect(DASHBOARD_VISIBLE_STATUSES).toContain("active");
    expect(DASHBOARD_VISIBLE_STATUSES).toContain("paused");
    expect(DASHBOARD_VISIBLE_STATUSES).not.toContain("deleted");
  });

  it("isPubliclyVisible retorna true somente para active", () => {
    expect(isPubliclyVisible("active")).toBe(true);
    expect(isPubliclyVisible("paused")).toBe(false);
    expect(isPubliclyVisible("deleted")).toBe(false);
    expect(isPubliclyVisible(undefined)).toBe(false);
  });

  it("isDashboardVisible retorna true para active e paused", () => {
    expect(isDashboardVisible("active")).toBe(true);
    expect(isDashboardVisible("paused")).toBe(true);
    expect(isDashboardVisible("deleted")).toBe(false);
    expect(isDashboardVisible(undefined)).toBe(false);
  });
});
