import { describe, it, expect } from "vitest";
import { normalizeDashboardPayload, unwrapDashboardPayload } from "./normalize-dashboard-payload";

describe("normalize-dashboard-payload", () => {
  it("unwrapDashboardPayload extrai data e payload", () => {
    expect(unwrapDashboardPayload({ data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapDashboardPayload({ success: true, payload: { b: 2 } })).toEqual({ b: 2 });
    expect(unwrapDashboardPayload({ user: { id: "x" } })).toEqual({ user: { id: "x" } });
  });

  it("normaliza envelope com data e métricas camelCase", () => {
    const out = normalizeDashboardPayload({
      data: {
        ok: true,
        user: { id: "u1", name: "Test", email: "t@test.com", type: "CPF", cnpj_verified: false },
        metrics: { activeAds: 2, highlightedAds: 1, views: 10, leads: 0 },
        active_ads: [],
        paused_ads: [],
        boost_options: [],
      },
    });
    expect(out?.user.id).toBe("u1");
    expect(out?.stats.active_ads).toBe(2);
    expect(out?.stats.total_views).toBe(10);
  });

  it("aceita id numérico ou sub (JWT)", () => {
    const out = normalizeDashboardPayload({
      user: { id: 42, name: "N", email: "e@e.com", type: "CPF" },
      stats: {},
      active_ads: [],
      paused_ads: [],
      boost_options: [],
    });
    expect(out?.user.id).toBe("42");

    const out2 = normalizeDashboardPayload({
      user: { sub: "jwt-sub", name: "N", email: "e@e.com", type: "CNPJ", cnpj_verified: true },
      stats: {},
      active_ads: [],
      paused_ads: [],
      boost_options: [],
    });
    expect(out2?.user.id).toBe("jwt-sub");
  });
});
