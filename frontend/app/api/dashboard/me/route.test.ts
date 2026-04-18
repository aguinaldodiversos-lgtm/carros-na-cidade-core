import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardPayload } from "@/lib/dashboard-types";
import type { SessionData } from "@/services/sessionService";

const mocks = vi.hoisted(() => {
  class MockBackendApiError extends Error {
    public readonly status: number;
    public readonly code?: string;
    public readonly details?: unknown;
    public readonly url: string;

    constructor(params: {
      message: string;
      status: number;
      url: string;
      code?: string;
      details?: unknown;
    }) {
      super(params.message);
      this.name = "BackendApiError";
      this.status = params.status;
      this.url = params.url;
      this.code = params.code;
      this.details = params.details;
    }
  }

  return {
    MockBackendApiError,
    fetchDashboard: vi.fn(),
    ensureSessionWithFreshBackendTokens: vi.fn(),
    getSessionDataFromRequest: vi.fn(),
    applySessionCookiesToResponse: vi.fn(),
    applyPrivateNoStoreHeaders: vi.fn((res: Response) => {
      res.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
      return res;
    }),
    applyUnauthorizedWithSessionCleanup: vi.fn(
      (_request: unknown, body?: Record<string, unknown>) =>
        Response.json(body ?? { error: "Nao autenticado" }, { status: 401 })
    ),
  };
});

vi.mock("@/lib/account/backend-account", () => ({
  BackendApiError: mocks.MockBackendApiError,
  fetchDashboard: mocks.fetchDashboard,
}));

vi.mock("@/lib/session/ensure-backend-session", () => ({
  ensureSessionWithFreshBackendTokens: mocks.ensureSessionWithFreshBackendTokens,
}));

vi.mock("@/services/sessionService", () => ({
  applyPrivateNoStoreHeaders: mocks.applyPrivateNoStoreHeaders,
  applySessionCookiesToResponse: mocks.applySessionCookiesToResponse,
  applyUnauthorizedWithSessionCleanup: mocks.applyUnauthorizedWithSessionCleanup,
  getSessionDataFromRequest: mocks.getSessionDataFromRequest,
}));

import { GET } from "./route";

function makeSession(overrides?: Partial<SessionData>): SessionData {
  return {
    id: "u1",
    name: "Teste",
    email: "t@test.com",
    type: "CPF",
    accessToken: "stale-at-with-future-exp",
    refreshToken: "valid-rt",
    ...overrides,
  };
}

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
      active_ads: 1,
      paused_ads: 0,
      featured_ads: 0,
      total_views: 10,
      free_limit: 3,
      plan_limit: 3,
      available_limit: 2,
      plan_name: "Plano gratuito",
      is_verified_store: false,
    },
    active_ads: [],
    paused_ads: [],
    boost_options: [],
  };
}

function backendError(status: number, message = "backend error") {
  return new mocks.MockBackendApiError({
    message,
    status,
    url: "https://backend.test/api/account/dashboard",
  });
}

function fakeRequest() {
  return {
    cookies: { get: vi.fn(() => undefined) },
    headers: { get: vi.fn(() => null) },
  } as unknown as import("next/server").NextRequest;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("GET /api/dashboard/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const session = makeSession();
    mocks.getSessionDataFromRequest.mockReturnValue(session);
    mocks.ensureSessionWithFreshBackendTokens.mockResolvedValue({ ok: true, session });
    mocks.fetchDashboard.mockResolvedValue(minimalPayload());
  });

  it("retorna 200 quando a sessao e o token backend sao validos", async () => {
    const response = await GET(fakeRequest());

    expect(response.status).toBe(200);
    expect(mocks.fetchDashboard).toHaveBeenCalledTimes(1);
    expect(mocks.ensureSessionWithFreshBackendTokens).toHaveBeenCalledTimes(1);
  });

  it("access token invalido com exp futuro tenta refresh uma vez e nao vira 502", async () => {
    const staleSession = makeSession();
    const refreshedSession = makeSession({
      accessToken: "fresh-at",
      refreshToken: "fresh-rt",
    });
    mocks.ensureSessionWithFreshBackendTokens
      .mockResolvedValueOnce({ ok: true, session: staleSession })
      .mockResolvedValueOnce({
        ok: true,
        session: refreshedSession,
        persistCookies: refreshedSession,
      });
    mocks.fetchDashboard.mockRejectedValueOnce(backendError(401, "Access token invalido"));
    mocks.fetchDashboard.mockResolvedValueOnce(minimalPayload());

    const response = await GET(fakeRequest());

    expect(response.status).toBe(200);
    expect(mocks.ensureSessionWithFreshBackendTokens).toHaveBeenNthCalledWith(1, staleSession);
    expect(mocks.ensureSessionWithFreshBackendTokens).toHaveBeenNthCalledWith(2, staleSession, {
      forceRefresh: true,
    });
    expect(mocks.fetchDashboard).toHaveBeenNthCalledWith(1, staleSession);
    expect(mocks.fetchDashboard).toHaveBeenNthCalledWith(2, refreshedSession);
    expect(mocks.applySessionCookiesToResponse).toHaveBeenCalledWith(
      expect.anything(),
      refreshedSession
    );
  });

  it("access token invalido com refresh falho retorna 401 final, nao 502", async () => {
    const staleSession = makeSession();
    mocks.ensureSessionWithFreshBackendTokens
      .mockResolvedValueOnce({ ok: true, session: staleSession })
      .mockResolvedValueOnce({ ok: false, reason: "cannot_refresh" });
    mocks.fetchDashboard.mockRejectedValueOnce(backendError(401, "Access token invalido"));

    const response = await GET(fakeRequest());
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "backend_unauthorized" },
    });
    expect(mocks.fetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("nao tenta segundo refresh quando a sessao ja foi renovada antes da chamada", async () => {
    const refreshedSession = makeSession({
      accessToken: "fresh-at",
      refreshToken: "fresh-rt",
    });
    mocks.ensureSessionWithFreshBackendTokens.mockResolvedValueOnce({
      ok: true,
      session: refreshedSession,
      persistCookies: refreshedSession,
    });
    mocks.fetchDashboard.mockRejectedValueOnce(backendError(401, "Access token invalido"));

    const response = await GET(fakeRequest());

    expect(response.status).toBe(401);
    expect(mocks.ensureSessionWithFreshBackendTokens).toHaveBeenCalledTimes(1);
    expect(mocks.fetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("preserva 403 do backend como acesso negado", async () => {
    mocks.fetchDashboard.mockRejectedValueOnce(backendError(403, "Forbidden"));

    const response = await GET(fakeRequest());
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "backend_forbidden", upstreamStatus: 403 },
    });
    expect(mocks.ensureSessionWithFreshBackendTokens).toHaveBeenCalledTimes(1);
  });

  it("mapeia 5xx real do backend para 502 com upstreamStatus", async () => {
    mocks.fetchDashboard.mockRejectedValueOnce(backendError(500, "Database down"));

    const response = await GET(fakeRequest());
    const body = await readJson(response);

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "backend_unavailable", upstreamStatus: 500 },
    });
  });

  it("mapeia erro de rede para 502 de gateway", async () => {
    mocks.fetchDashboard.mockRejectedValueOnce(
      new Error("Erro ao comunicar com o backend em /api/account/dashboard: fetch failed")
    );

    const response = await GET(fakeRequest());
    const body = await readJson(response);

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "network_error" },
    });
  });
});
