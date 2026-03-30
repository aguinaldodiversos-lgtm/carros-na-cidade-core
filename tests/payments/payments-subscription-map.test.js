import { describe, it, expect } from "vitest";
import {
  resolveSubscriptionStatus,
  resolveExpiryDate,
} from "../../src/modules/payments/payments.service.js";

describe("payments — mapeamento de status de assinatura (webhook)", () => {
  it("resolveSubscriptionStatus mapeia approved/pending/outros", () => {
    expect(resolveSubscriptionStatus("approved")).toBe("active");
    expect(resolveSubscriptionStatus("pending")).toBe("pending");
    expect(resolveSubscriptionStatus("rejected")).toBe("canceled");
    expect(resolveSubscriptionStatus("canceled")).toBe("canceled");
    expect(resolveSubscriptionStatus(undefined)).toBe("canceled");
  });

  it("resolveExpiryDate retorna ISO ou null", () => {
    expect(resolveExpiryDate(null)).toBeNull();
    expect(resolveExpiryDate(0)).toBeNull();
    const iso = resolveExpiryDate(30);
    expect(typeof iso).toBe("string");
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });
});
