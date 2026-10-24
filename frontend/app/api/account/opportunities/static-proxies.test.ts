// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressão real dos BFFs estáticos do hub: Next.js não injeta params em
 * /access e /summary. Não mockar createBackendProxy: o bug ocorria ao ler
 * params.path dentro dele, antes de chegar ao backend.
 */
const ROUTES = [
  {
    label: "permissões",
    route: "access",
    backendPath: "/api/account/opportunities/summary/access",
    payload: { success: true, rights: { mode: "launch", buyers: true, vehicle_evaluation: true } },
  },
  {
    label: "resumo",
    route: "summary",
    backendPath: "/api/account/opportunities/summary",
    payload: { success: true, summary: { active_buyers: { total: 3, trend: null } } },
  },
] as const;

function makeRequest(route: "access" | "summary", search = "") {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: { search },
  } as unknown as import("next/server").NextRequest;
}

async function getHandler(route: "access" | "summary") {
  if (route === "access") return (await import("./access/route")).GET;
  return (await import("./summary/route")).GET;
}

function mockSession(authorized: boolean) {
  vi.doMock("@/lib/http/bff-session", () => ({
    authenticateBffRequest: async () =>
      authorized
        ? {
            ok: true,
            ctx: {
              backendHeaders: { Authorization: "Bearer regression-token" },
            },
          }
        : { ok: false },
    applyBffCookies: (response: unknown) => response,
  }));
}

beforeEach(() => {
  vi.resetModules();
  mockSession(true);
  vi.doMock("@/lib/env/backend-api", () => ({
    resolveInternalBackendApiUrl: (path: string) => `https://backend.test${path}`,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/http/bff-session");
  vi.doUnmock("@/lib/env/backend-api");
  vi.resetModules();
});

describe("BFF estático de oportunidades — params ausentes", () => {
  it.each(ROUTES)("GET $label funciona sem contexto de rota e encaminha o token", async (spec) => {
    const upstream = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => spec.payload,
    });
    vi.stubGlobal("fetch", upstream);

    const GET = await getHandler(spec.route);
    // Chamada idêntica ao Next em uma rota sem segmentos dinâmicos.
    const response = await GET(makeRequest(spec.route));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(spec.payload);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe(`https://backend.test${spec.backendPath}`);
    expect(upstream.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer regression-token" },
      cache: "no-store",
    });
  });

  it("summary preserva query string e status do backend", async () => {
    const upstream = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ success: false, details: { code: "STORE_SELECTION_REQUIRED" } }),
    });
    vi.stubGlobal("fetch", upstream);

    const { GET } = await import("./summary/route");
    const response = await GET(makeRequest("summary", "?advertiser_id=123"));

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(upstream.mock.calls[0][0]).toBe(
      "https://backend.test/api/account/opportunities/summary?advertiser_id=123"
    );
    await expect(response.json()).resolves.toMatchObject({
      details: { code: "STORE_SELECTION_REQUIRED" },
    });
  });

  it.each(ROUTES)("GET $label mantém 401 sem sessão e não consulta o backend", async (spec) => {
    mockSession(false);
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const GET = await getHandler(spec.route);
    const response = await GET(makeRequest(spec.route));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(upstream).not.toHaveBeenCalled();
  });
});
