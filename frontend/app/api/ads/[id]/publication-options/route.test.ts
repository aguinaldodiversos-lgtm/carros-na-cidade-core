// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BFF GET /api/ads/:id/publication-options — defesas básicas:
 *   - exige autenticação (401 quando ausente);
 *   - propaga 404/410 do backend (ad de outro user / status bloqueado);
 *   - encaminha SOMENTE Authorization (não vaza cookies/IP do user pra MP).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

function makeRequest(_id: string) {
  return {
    nextUrl: { origin: "https://example.com" },
  } as unknown as import("next/server").NextRequest;
}

describe("BFF GET /api/ads/:id/publication-options", () => {
  it("401 quando sessão ausente — não chama backend", async () => {
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
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("./route");
    const res = await GET(makeRequest("ad-1"), { params: { id: "ad-1" } });
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propaga 404 do backend (ad de outro user) sem reescrever payload", async () => {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: true,
        ctx: { session: { accessToken: "tok" }, backendHeaders: {} },
      }),
      applyBffCookies: (res: unknown) => res,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: "Anuncio nao encontrado" }),
      } as Response)
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest("ad-x"), { params: { id: "ad-x" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/nao encontrado/i);
  });

  it("propaga 410 (deleted/blocked) do backend", async () => {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: true,
        ctx: { session: { accessToken: "tok" }, backendHeaders: {} },
      }),
      applyBffCookies: (res: unknown) => res,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 410,
        json: async () => ({
          message: "Anuncio em status 'deleted' nao admite acoes de publicacao.",
        }),
      } as Response)
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest("ad-1"), { params: { id: "ad-1" } });
    expect(res.status).toBe(410);
  });

  it("forward inclui Authorization Bearer e Accept; não inclui boostOption/price", async () => {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: true,
        ctx: { session: { accessToken: "tok-abc" }, backendHeaders: {} },
      }),
      applyBffCookies: (res: unknown) => res,
    }));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ad: { id: "ad-1" }, actions: [] } }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("./route");
    const res = await GET(makeRequest("ad-1"), { params: { id: "ad-1" } });
    expect(res.status).toBe(200);

    const [, init] = fetchSpy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-abc");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).body).toBeUndefined();
  });
});
