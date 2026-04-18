import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockBackendAuthError extends Error {
    public readonly status: number;
    public readonly upstreamStatus: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "BackendAuthError";
      this.status = status;
      this.upstreamStatus = status;
    }
  }

  return {
    MockBackendAuthError,
    authenticateUser: vi.fn(),
    buildBffBackendForwardHeaders: vi.fn(() => ({ "X-Cnc-Client-Ip": "1.2.3.4" })),
  };
});

vi.mock("@/services/authService", () => ({
  BackendAuthError: mocks.MockBackendAuthError,
  authenticateUser: mocks.authenticateUser,
}));

vi.mock("@/lib/http/client-ip", () => ({
  buildBffBackendForwardHeaders: mocks.buildBffBackendForwardHeaders,
}));

import { POST } from "./route";

const envSnapshot = {
  authSessionSecret: process.env.AUTH_SESSION_SECRET,
  nodeEnv: process.env.NODE_ENV,
};

function envRecord() {
  return process.env as Record<string, string | undefined>;
}

function fakeRequest(body: Record<string, unknown>) {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: { get: vi.fn(() => null) },
    cookies: { get: vi.fn(() => undefined) },
  } as unknown as import("next/server").NextRequest;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function validAuthSession() {
  return {
    user: {
      id: "user-1",
      name: "Usuario Teste",
      email: "valid@test.com",
      type: "CPF" as const,
      cnpj_verified: false,
    },
    accessToken: "access-token",
    refreshToken: "refresh-token",
  };
}

describe("POST /api/auth/login", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const env = envRecord();
    env.AUTH_SESSION_SECRET = "unit-test-session-secret-32chars!!";
    env.NODE_ENV = "production";
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    const env = envRecord();
    if (envSnapshot.authSessionSecret === undefined) delete env.AUTH_SESSION_SECRET;
    else env.AUTH_SESSION_SECRET = envSnapshot.authSessionSecret;
    if (envSnapshot.nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = envSnapshot.nodeEnv;
  });

  it("preserva 401 de credenciais invalidas", async () => {
    mocks.authenticateUser.mockRejectedValueOnce(
      new mocks.MockBackendAuthError("Credenciais invalidas", 401)
    );

    const response = await POST(fakeRequest({ email: "invalid@test.com", password: "wrong-pass" }));
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Credenciais invalidas" });
  });

  it("preserva 403 tratavel do backend", async () => {
    mocks.authenticateUser.mockRejectedValueOnce(
      new mocks.MockBackendAuthError("E-mail ainda nao verificado", 403)
    );

    const response = await POST(
      fakeRequest({ email: "blocked@test.com", password: "correct-pass" })
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "E-mail ainda nao verificado" });
  });

  it("preserva 429 tratavel do backend", async () => {
    mocks.authenticateUser.mockRejectedValueOnce(
      new mocks.MockBackendAuthError("Muitas tentativas. Tente novamente mais tarde.", 429)
    );

    const response = await POST(fakeRequest({ email: "rate@test.com", password: "correct-pass" }));
    const body = await readJson(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: "Muitas tentativas. Tente novamente mais tarde." });
  });

  it("retorna 502 para falha real de conexao com upstream", async () => {
    mocks.authenticateUser.mockRejectedValueOnce(new Error("fetch failed"));

    const response = await POST(fakeRequest({ email: "valid@test.com", password: "correct-pass" }));
    const body = await readJson(response);

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "Servidor indisponivel. Verifique se o backend esta ativo.",
    });
  });

  it("cria cookies de sessao no login valido", async () => {
    mocks.authenticateUser.mockResolvedValueOnce(validAuthSession());

    const response = await POST(
      fakeRequest({ email: "valid@test.com", password: "correct-pass", next: "/comprar" })
    );
    const body = await readJson(response);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      redirect_to: "/comprar",
      user: {
        id: "user-1",
        email: "valid@test.com",
        type: "CPF",
      },
    });
    expect(setCookie).toContain("cnc_session=");
    expect(setCookie).toContain("cnc_at=access-token");
    expect(setCookie).toContain("cnc_rt=refresh-token");
  });

  it("cria sessao com segredo efemero quando AUTH_SESSION_SECRET esta ausente em producao", async () => {
    delete envRecord().AUTH_SESSION_SECRET;
    mocks.authenticateUser.mockResolvedValueOnce(validAuthSession());

    const response = await POST(fakeRequest({ email: "valid@test.com", password: "correct-pass" }));
    const body = await readJson(response);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ redirect_to: "/dashboard" });
    expect(setCookie).toContain("cnc_session=");
    expect(setCookie).toContain("cnc_at=access-token");
    expect(setCookie).toContain("cnc_rt=refresh-token");
  });
});
