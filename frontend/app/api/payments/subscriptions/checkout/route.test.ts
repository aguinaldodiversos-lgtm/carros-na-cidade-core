// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Defesa Fase 4 — assinatura Start/Pro NÃO ativável publicamente.
 *
 * O BFF /api/payments/subscriptions/checkout só responde 200 quando:
 *   - NODE_ENV !== "production" (dev/test/staging livre), OU
 *   - process.env.SUBSCRIPTIONS_LIVE === "1" (operadora liberou em prod).
 *
 * Em produção sem flag, deve retornar 503 SEM tocar backend / MP.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete (process.env as Record<string, string | undefined>).SUBSCRIPTIONS_LIVE;
  delete (process.env as Record<string, string | undefined>).NODE_ENV;
});

beforeEach(() => {
  vi.resetModules();
});

function makeRequest(body: Record<string, unknown> = { plan_id: "cnpj-store-start" }) {
  return {
    json: async () => body,
    nextUrl: { origin: "https://example.com" },
  } as unknown as import("next/server").NextRequest;
}

describe("BFF /api/payments/subscriptions/checkout — guard de produção", () => {
  it("503 em produção sem SUBSCRIPTIONS_LIVE=1, sem tocar backend", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete (process.env as Record<string, string | undefined>).SUBSCRIPTIONS_LIVE;

    // Stub authenticateBffRequest pra garantir que NÃO é chamado antes do guard.
    const authSpy = vi.fn();
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: authSpy,
      applyBffCookies: (res: unknown) => res,
    }));

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("./route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/em validacao|valida[cç][aã]o/i);

    // GUARD ESTRITO: nem auth, nem MP, nem backend devem ter sido chamados.
    expect(authSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("em produção COM SUBSCRIPTIONS_LIVE=1, segue para auth (sai do guard de flag)", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.SUBSCRIPTIONS_LIVE = "1";

    // Auth retorna 401 — comprova que o guard foi ultrapassado e auth foi consultado.
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
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejeita plan_id fora do whitelist mesmo com flag ligada (defesa em camada)", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.SUBSCRIPTIONS_LIVE = "1";

    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: true,
        ctx: {
          session: { accessToken: "tok" },
          backendHeaders: {},
        },
      }),
      applyBffCookies: (res: unknown) => res,
    }));

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ plan_id: "cpf-premium-highlight" }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("400 quando plan_id ausente (mesmo em dev)", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";

    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: true,
        ctx: {
          session: { accessToken: "tok" },
          backendHeaders: {},
        },
      }),
      applyBffCookies: (res: unknown) => res,
    }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
