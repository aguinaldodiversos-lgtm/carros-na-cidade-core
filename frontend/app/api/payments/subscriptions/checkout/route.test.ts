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

  it("encaminha plano não-assinável ao backend e repassa a rejeição data-driven (sem whitelist no cliente)", async () => {
    // Contrato atual (DIFF 1): a assinabilidade é DATA-DRIVEN e decidida no
    // BACKEND (coluna subscribable), não no cliente. A BFF NÃO mantém whitelist
    // fixa — encaminha ao backend, que rejeita plano não-assinável com mensagem
    // clara. Reintroduzir whitelist aqui dessincronizaria dos planos
    // configuráveis (o problema que o DIFF 1 resolveu).
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
    vi.doMock("@/lib/env/backend-api", () => ({
      resolveInternalBackendApiUrl: () =>
        "http://backend.internal/api/payments/subscriptions/checkout",
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      buildBffBackendForwardHeaders: () => ({}),
    }));

    // Backend responde 400 { success:false, error:true, message } para plano
    // não-assinável (assertSubscribablePlan). A BFF deve repassar a MESSAGE
    // (string), não o boolean `error` — mesmo fix de observabilidade.
    const backendMsg = "Plano nao esta disponivel para assinatura.";
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: true, message: backendMsg }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ plan_id: "cpf-premium-highlight" }));

    // BFF NÃO bloqueia no cliente: encaminha ao backend...
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // ...e repassa status + a causa real (não `true`).
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(backendMsg);
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

describe("BFF /api/payments/subscriptions/checkout — observabilidade do erro", () => {
  function mockAuthOk() {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({ ok: true, ctx: { session: { accessToken: "tok" } } }),
      applyBffCookies: (res: unknown) => res,
    }));
    vi.doMock("@/lib/env/backend-api", () => ({
      resolveInternalBackendApiUrl: () =>
        "http://backend.internal/api/payments/subscriptions/checkout",
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      buildBffBackendForwardHeaders: () => ({}),
    }));
  }

  it("repassa a MESSAGE real do backend (não o boolean error) e mantém o status", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    mockAuthOk();

    // Backend responde { success:false, error:true, message:"<causa>" } — `error`
    // é BOOLEAN. A BFF deve devolver a `message`, não `true`.
    const backendMsg =
      "Mercado Pago error (400): Invalid value for back_url, must be a valid URL";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => ({ success: false, error: true, message: backendMsg, requestId: "r1" }),
      }))
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe(backendMsg); // ← causa real, NÃO `true`
    expect(consoleSpy).toHaveBeenCalled(); // logou a causa no caminho !ok
  });

  it("usa `error` do backend quando vier como STRING (compat) e não há message", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    mockAuthOk();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "plan_id nao suportado nesta rota dedicada" }),
      }))
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("plan_id nao suportado nesta rota dedicada");
  });
});
