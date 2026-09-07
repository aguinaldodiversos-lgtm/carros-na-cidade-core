import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Homologação pré-lançamento — GRUPO I (ADM-01, ADM-04 no lado do shell).
 *
 * Motivo de existir: `tests/admin/admin-role-middleware.test.js` e
 * `admin-routes-contract.test.js` provam que a API Express recusa quem não é
 * admin — a defesa que realmente protege o DADO. Nada, porém, cobria o guard
 * do Next que decide se o shell `/admin` chega a ser entregue, nem o proxy
 * `/api/admin/[...path]` que compartilha esta mesma função.
 *
 * Dois comportamentos aqui são fáceis de quebrar por refatoração e caros de
 * descobrir em produção:
 *
 *   1. FAIL-CLOSED quando o backend não responde. Um `catch` que devolvesse
 *      "ok" por otimismo entregaria o painel administrativo a qualquer sessão
 *      sempre que a API oscilasse.
 *   2. O CACHE DE PAPEL de 30s. É uma decisão consciente (evita round-trip por
 *      render), mas significa que revogar um admin leva até 30s para valer.
 *      Fixar isso em teste transforma uma pegadinha em contrato conhecido.
 *
 * IDs cobertos:
 *   ADM-01  usuário comum autenticado → forbidden (não entra em /admin)
 *   ADM-04  sem sessão / sem token → unauthenticated
 */

const ensureSessionWithFreshBackendTokens = vi.fn();
vi.mock("@/lib/session/ensure-backend-session", () => ({
  ensureSessionWithFreshBackendTokens: (...args: unknown[]) =>
    ensureSessionWithFreshBackendTokens(...args),
}));

vi.mock("@/lib/env/backend-api", () => ({
  resolveInternalBackendApiUrl: (p: string) => `http://backend.interno${p}`,
  resolveBackendApiUrl: (p: string) => `http://backend.interno${p}`,
}));

vi.mock("@/lib/http/internal-backend-headers", () => ({
  buildInternalBackendHeaders: () => ({ "x-internal-token": "tok" }),
}));

// `next/headers` e `next/navigation` só são usados por `requireAdminSession()`,
// que não é o alvo aqui (redirect() lança por design). Stub mínimo para o
// módulo carregar.
vi.mock("next/headers", () => ({ cookies: () => ({}), headers: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/services/sessionService", () => ({
  getSessionDataFromCookieStore: () => null,
}));

const SESSAO = { id: "u-1", accessToken: "access-1", refreshToken: "refresh-1" };

const fetchMock = vi.fn();

async function carregar() {
  vi.resetModules();
  return import("./server-admin-session");
}

/** Resposta de /api/auth/me com o papel informado. */
function meComPapel(role: string | null, ok = true) {
  return {
    ok,
    json: async () => (role == null ? {} : { user: { role } }),
  };
}

beforeEach(() => {
  ensureSessionWithFreshBackendTokens.mockReset().mockImplementation(async (s: typeof SESSAO) => ({
    ok: true,
    session: s,
  }));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ADM-04 — sessão ausente ou incompleta", () => {
  it("sem sessão → unauthenticated, sem tocar o backend", async () => {
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(null)).resolves.toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sessão sem token nenhum → unauthenticated", async () => {
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession({ id: "u-1" } as never)).resolves.toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refresh do backend falha → unauthenticated (não tenta ler o papel)", async () => {
    ensureSessionWithFreshBackendTokens.mockResolvedValue({ ok: false, reason: "expired" });
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(SESSAO as never)).resolves.toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ADM-01 — usuário comum não entra em /admin", () => {
  it("role 'user' → forbidden", async () => {
    fetchMock.mockResolvedValue(meComPapel("user"));
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(SESSAO as never)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("role vazio/ausente no /me → backend_unreachable, nunca admin", async () => {
    fetchMock.mockResolvedValue(meComPapel(null));
    const { assertAdminSession } = await carregar();

    const r = await assertAdminSession(SESSAO as never);
    expect(r.ok).toBe(false);
    expect(r).not.toMatchObject({ role: "admin" });
  });

  it("role 'admin' → ok", async () => {
    fetchMock.mockResolvedValue(meComPapel("admin"));
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(SESSAO as never)).resolves.toMatchObject({
      ok: true,
      role: "admin",
    });
  });

  it("'ADMIN' em caixa alta NÃO é aceito — a comparação é exata", async () => {
    fetchMock.mockResolvedValue(meComPapel("ADMIN"));
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(SESSAO as never)).resolves.toMatchObject({ ok: false });
  });
});

describe("fail-closed quando o backend não responde", () => {
  it("HTTP não-ok em /me → backend_unreachable (não libera o painel)", async () => {
    fetchMock.mockResolvedValue(meComPapel("admin", false));
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(SESSAO as never)).resolves.toEqual({
      ok: false,
      reason: "backend_unreachable",
    });
  });

  it("fetch lança (rede/timeout) → backend_unreachable, sem propagar exceção", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(SESSAO as never)).resolves.toEqual({
      ok: false,
      reason: "backend_unreachable",
    });
  });

  it("resposta com JSON inválido também é backend_unreachable", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const { assertAdminSession } = await carregar();

    await expect(assertAdminSession(SESSAO as never)).resolves.toEqual({
      ok: false,
      reason: "backend_unreachable",
    });
  });
});

describe("cache de papel — contrato explícito, não acidente", () => {
  it("duas verificações seguidas do mesmo usuário fazem UM fetch só", async () => {
    fetchMock.mockResolvedValue(meComPapel("admin"));
    const { assertAdminSession } = await carregar();

    await assertAdminSession(SESSAO as never);
    await assertAdminSession(SESSAO as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clearAdminRoleCache força releitura — é o caminho para revogar na hora", async () => {
    fetchMock.mockResolvedValue(meComPapel("admin"));
    const { assertAdminSession, clearAdminRoleCache } = await carregar();

    await assertAdminSession(SESSAO as never);
    clearAdminRoleCache(SESSAO.id);
    fetchMock.mockResolvedValue(meComPapel("user"));

    await expect(assertAdminSession(SESSAO as never)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("o cache é por usuário: outra sessão não herda o papel do admin", async () => {
    fetchMock.mockResolvedValue(meComPapel("admin"));
    const { assertAdminSession } = await carregar();
    await assertAdminSession(SESSAO as never);

    fetchMock.mockResolvedValue(meComPapel("user"));
    const outra = { id: "u-2", accessToken: "a2", refreshToken: "r2" };

    await expect(assertAdminSession(outra as never)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("um usuário comum em cache continua barrado sem novo fetch", async () => {
    fetchMock.mockResolvedValue(meComPapel("user"));
    const { assertAdminSession } = await carregar();

    await assertAdminSession(SESSAO as never);
    await assertAdminSession(SESSAO as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
