import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateUser, resetPassword } from "./authService";

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: vi.fn(() => "https://backend.test"),
  resolveInternalBackendApiUrl: vi.fn(() => "https://backend.test/api/auth/reset-password"),
}));
vi.mock("@/lib/http/internal-backend-headers", () => ({
  buildInternalBackendHeaders: vi.fn(() => ({})),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("autenticação fail-closed", () => {
  it("envia newPassword, como o backend exige", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(await resetPassword("token-valido", "NovaSenha2026!")).toBe(true);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request.body))).toEqual({
      token: "token-valido",
      newPassword: "NovaSenha2026!",
    });
  });

  it("não declara sucesso quando o backend responde com erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await resetPassword("token-valido", "NovaSenha2026!")).toBe(false);
  });

  it("não declara sucesso quando a conexão falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    expect(await resetPassword("token-valido", "NovaSenha2026!")).toBe(false);
  });

  it("não permite credenciais demo sem backend em produção", async () => {
    const env = await import("@/lib/env/backend-api");
    vi.mocked(env.getBackendApiBaseUrl).mockReturnValueOnce(null as never);
    vi.stubEnv("NODE_ENV", "production");
    const session = await authenticateUser("cpf@carrosnacidade.com", "123456");
    expect(session).toBeNull();
  });
});
