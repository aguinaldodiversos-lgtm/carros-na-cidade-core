import { describe, it, expect } from "vitest";
import {
  AD_STATUS,
  AD_VISIBLE_STATUSES,
  AD_OWNER_VISIBLE_STATUSES,
  AD_NON_DELETED_STATUSES,
  ADVERTISER_STATUS,
  USER_ROLE,
  PAYMENT_INTENT_STATUS,
  SUBSCRIPTION_STATUS,
  isValidAdStatus,
  isValidAdvertiserStatus,
  isValidUserRole,
} from "../../src/shared/constants/status.js";

describe("canonical status constants", () => {
  it("AD_STATUS contains expected values", () => {
    expect(AD_STATUS.ACTIVE).toBe("active");
    expect(AD_STATUS.PAUSED).toBe("paused");
    expect(AD_STATUS.DELETED).toBe("deleted");
    expect(AD_STATUS.BLOCKED).toBe("blocked");
  });

  it("AD_VISIBLE_STATUSES only includes active", () => {
    expect(AD_VISIBLE_STATUSES).toEqual(["active"]);
  });

  it("AD_OWNER_VISIBLE_STATUSES includes active, paused, blocked", () => {
    expect(AD_OWNER_VISIBLE_STATUSES).toContain("active");
    expect(AD_OWNER_VISIBLE_STATUSES).toContain("paused");
    expect(AD_OWNER_VISIBLE_STATUSES).toContain("blocked");
    expect(AD_OWNER_VISIBLE_STATUSES).not.toContain("deleted");
  });

  it("ADVERTISER_STATUS contains expected values", () => {
    expect(ADVERTISER_STATUS.ACTIVE).toBe("active");
    expect(ADVERTISER_STATUS.SUSPENDED).toBe("suspended");
    expect(ADVERTISER_STATUS.BLOCKED).toBe("blocked");
  });

  it("USER_ROLE defines user and admin", () => {
    expect(USER_ROLE.USER).toBe("user");
    expect(USER_ROLE.ADMIN).toBe("admin");
  });

  it("PAYMENT_INTENT_STATUS matches DB CHECK constraint", () => {
    expect(PAYMENT_INTENT_STATUS.PENDING).toBe("pending");
    expect(PAYMENT_INTENT_STATUS.APPROVED).toBe("approved");
    expect(PAYMENT_INTENT_STATUS.REJECTED).toBe("rejected");
    expect(PAYMENT_INTENT_STATUS.CANCELED).toBe("canceled");
  });

  it("SUBSCRIPTION_STATUS matches DB CHECK constraint", () => {
    expect(SUBSCRIPTION_STATUS.ACTIVE).toBe("active");
    expect(SUBSCRIPTION_STATUS.EXPIRED).toBe("expired");
    expect(SUBSCRIPTION_STATUS.CANCELED).toBe("canceled");
    expect(SUBSCRIPTION_STATUS.PENDING).toBe("pending");
  });

  it("isValidAdStatus validates correctly", () => {
    expect(isValidAdStatus("active")).toBe(true);
    expect(isValidAdStatus("paused")).toBe(true);
    expect(isValidAdStatus("deleted")).toBe(true);
    expect(isValidAdStatus("blocked")).toBe(true);
    expect(isValidAdStatus("invalid")).toBe(false);
    expect(isValidAdStatus("")).toBe(false);
  });

  it("isValidAdvertiserStatus validates correctly", () => {
    expect(isValidAdvertiserStatus("active")).toBe(true);
    expect(isValidAdvertiserStatus("suspended")).toBe(true);
    expect(isValidAdvertiserStatus("blocked")).toBe(true);
    expect(isValidAdvertiserStatus("paused")).toBe(false);
  });

  it("isValidUserRole validates correctly", () => {
    expect(isValidUserRole("user")).toBe(true);
    expect(isValidUserRole("admin")).toBe(true);
    expect(isValidUserRole("superadmin")).toBe(false);
  });

  it("all status objects are frozen", () => {
    expect(Object.isFrozen(AD_STATUS)).toBe(true);
    expect(Object.isFrozen(ADVERTISER_STATUS)).toBe(true);
    expect(Object.isFrozen(USER_ROLE)).toBe(true);
    expect(Object.isFrozen(PAYMENT_INTENT_STATUS)).toBe(true);
    expect(Object.isFrozen(SUBSCRIPTION_STATUS)).toBe(true);
  });
});
