import { describe, it, expect } from "vitest";
import { assertSubscribablePlan } from "../../src/modules/payments/subscriptions.guards.js";

/**
 * ETAPA 2 — elegibilidade DATA-DRIVEN ao checkout de assinatura.
 * assertSubscribablePlan(plan): existe + is_active + subscribable + mensal.
 * Sem whitelist fixa: criar/editar plano no admin não exige mexer em código.
 */

const MONTHLY_ACTIVE_SUBSCRIBABLE = {
  id: "cnpj-store-x",
  is_active: true,
  billing_model: "monthly",
  subscribable: true,
};

describe("assertSubscribablePlan", () => {
  it("ACEITA plano subscribable=true + is_active + mensal (não lança)", () => {
    expect(() => assertSubscribablePlan(MONTHLY_ACTIVE_SUBSCRIBABLE)).not.toThrow();
  });

  it("REJEITA subscribable=false com 400 (mesmo ativo e mensal)", () => {
    let err;
    try {
      assertSubscribablePlan({ ...MONTHLY_ACTIVE_SUBSCRIBABLE, subscribable: false });
    } catch (e) {
      err = e;
    }
    expect(err?.statusCode).toBe(400);
    expect(String(err?.message)).toMatch(/disponivel para assinatura/i);
  });

  it("REJEITA is_active=false com 404 — some de novas assinaturas (grandfathering)", () => {
    let err;
    try {
      assertSubscribablePlan({ ...MONTHLY_ACTIVE_SUBSCRIBABLE, is_active: false });
    } catch (e) {
      err = e;
    }
    expect(err?.statusCode).toBe(404);
  });

  it("REJEITA billing_model != monthly com 400", () => {
    let err;
    try {
      assertSubscribablePlan({ ...MONTHLY_ACTIVE_SUBSCRIBABLE, billing_model: "one_time" });
    } catch (e) {
      err = e;
    }
    expect(err?.statusCode).toBe(400);
    expect(String(err?.message)).toMatch(/mensal/i);
  });

  it("REJEITA plano inexistente (null) com 404", () => {
    let err;
    try {
      assertSubscribablePlan(null);
    } catch (e) {
      err = e;
    }
    expect(err?.statusCode).toBe(404);
  });
});
