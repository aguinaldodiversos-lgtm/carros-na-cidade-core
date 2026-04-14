import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchDashboardPayloadClient } from "./fetch-dashboard-me-client";
import type { DashboardPayload } from "@/lib/dashboard-types";

function minimalPayload(): DashboardPayload {
  return {
    user: {
      id: "u1",
      name: "Teste",
      email: "t@test.com",
      type: "CPF",
      cnpj_verified: false,
    },
    current_plan: null,
    stats: {
      active_ads: 0,
      paused_ads: 0,
      featured_ads: 0,
      total_views: 0,
      free_limit: 3,
      plan_limit: 3,
      available_limit: 3,
      plan_name: "Plano gratuito",
      is_verified_store: false,
    },
    active_ads: [],
    paused_ads: [],
    boost_options: [],
  };
}

describe("fetchDashboardPayloadClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("chama GET /api/dashboard/me com cache no-store e credentials include", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => minimalPayload(),
    } as Response);
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchDashboardPayloadClient();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/me",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "include",
      })
    );
  });

  it("retorna ok:true com payload quando HTTP 200", async () => {
    const payload = minimalPayload();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response);

    const result = await fetchDashboardPayloadClient();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.user.id).toBe("u1");
      expect(result.status).toBe(200);
    }
  });

  it("retorna erro estruturado quando BFF devolve 401", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        ok: false,
        error: { code: "backend_unauthorized", message: "Sessao invalida" },
      }),
    } as Response);

    const result = await fetchDashboardPayloadClient();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("backend_unauthorized");
      expect(result.message).toBe("Sessao invalida");
    }
  });

  it("preserva codigo e upstreamStatus quando BFF devolve 5xx real", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        ok: false,
        error: {
          code: "backend_unavailable",
          message: "Backend indisponivel",
          upstreamStatus: 500,
        },
      }),
    } as Response);

    const result = await fetchDashboardPayloadClient();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.code).toBe("backend_unavailable");
      expect(result.upstreamStatus).toBe(500);
    }
  });

  it("retorna erro de rede sem lancar excecao", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await fetchDashboardPayloadClient();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.code).toBe("network_error");
      expect(result.message).toContain("fetch failed");
    }
  });
});
