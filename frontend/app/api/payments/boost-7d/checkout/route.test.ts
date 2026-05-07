// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Defesa Fase 4 — BFF de checkout do Destaque 7 dias.
 *
 * Garantias:
 *   - 401 sem sessão (auth);
 *   - 400 sem ad_id (não inicia MP / backend);
 *   - body forwarded ao backend NÃO contém amount/price/days/boost_option_id
 *     vindos do client.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

function makeRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    nextUrl: { origin: "https://example.com" },
  } as unknown as import("next/server").NextRequest;
}

describe("BFF /api/payments/boost-7d/checkout", () => {
  it("401 quando sessão ausente (auth nega)", async () => {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: false,
        response: new Response(JSON.stringify({ error: "Nao autenticado" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      }),
      applyBffCookies: (res: unknown) => res,
    }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ad_id: "ad-1" }));
    expect(res.status).toBe(401);
  });

  it("400 quando ad_id ausente (não chama backend nem MP)", async () => {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: true,
        ctx: { session: { accessToken: "tok" }, backendHeaders: {} },
      }),
      applyBffCookies: (res: unknown) => res,
    }));

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forward para backend NUNCA repassa amount/price/days/boost_option_id do client", async () => {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: true,
        ctx: { session: { accessToken: "tok" }, backendHeaders: {} },
      }),
      applyBffCookies: (res: unknown) => res,
    }));

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ init_point: "https://mp.example/abc" }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        ad_id: "ad-1",
        // Tentativas de spoof do client — devem ser ignoradas pelo BFF.
        amount: 1,
        price: 1,
        boost_option_id: "boost-30d",
        days: 999,
      })
    );

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const forwarded = JSON.parse(String((init as RequestInit).body));
    expect(forwarded.ad_id).toBe("ad-1");
    expect(forwarded).not.toHaveProperty("amount");
    expect(forwarded).not.toHaveProperty("price");
    expect(forwarded).not.toHaveProperty("days");
    expect(forwarded).not.toHaveProperty("boost_option_id");
  });
});
