import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REGIONAL_PATH_REGEX,
  decideRegionalMiddlewareAction,
  extractRegionalSlug,
  isFlagEnabled,
  validateRegionalSlug,
  type SlugValidation,
} from "./regional-page-guard";

describe("REGIONAL_PATH_REGEX e extractRegionalSlug", () => {
  it("casa /carros-usados/regiao/<slug>", () => {
    expect(REGIONAL_PATH_REGEX.test("/carros-usados/regiao/atibaia-sp")).toBe(true);
    expect(extractRegionalSlug("/carros-usados/regiao/atibaia-sp")).toBe("atibaia-sp");
  });

  it("casa com trailing slash", () => {
    expect(extractRegionalSlug("/carros-usados/regiao/campinas-sp/")).toBe("campinas-sp");
  });

  it("NÃO casa /carros-usados/regiao puro (sem slug)", () => {
    expect(extractRegionalSlug("/carros-usados/regiao")).toBeNull();
    expect(extractRegionalSlug("/carros-usados/regiao/")).toBeNull();
  });

  it("NÃO casa subpaths mais profundos", () => {
    expect(extractRegionalSlug("/carros-usados/regiao/atibaia-sp/comparar")).toBeNull();
  });

  it("NÃO casa rotas que apenas parecem com regiao", () => {
    expect(extractRegionalSlug("/carros-usados")).toBeNull();
    expect(extractRegionalSlug("/regiao/atibaia-sp")).toBeNull();
    expect(extractRegionalSlug("/cidade/atibaia-sp")).toBeNull();
    expect(extractRegionalSlug("/carros-em/atibaia-sp")).toBeNull();
  });

  it("ignora query string e hash", () => {
    expect(extractRegionalSlug("/carros-usados/regiao/atibaia-sp")).toBe("atibaia-sp");
    // Em Next pathname já vem sem query/hash, mas regex defensivo cobre.
    expect(REGIONAL_PATH_REGEX.test("/carros-usados/regiao/atibaia-sp?foo=bar")).toBe(false);
  });
});

describe("isFlagEnabled — contrato estrito", () => {
  it("retorna true só com a string exata 'true'", () => {
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("rejeita 'True', 'TRUE', '1', 'yes', 'sim'", () => {
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "True" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "TRUE" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "1" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "yes" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "sim" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("rejeita string vazia, undefined, e espaços", () => {
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: " true " } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isFlagEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("rejeita 'false' explícito", () => {
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "false" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isFlagEnabled({ REGIONAL_PAGE_ENABLED: "False" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("validateRegionalSlug — fetch ao backend privado", () => {
  const BASE = "https://backend.example.com";
  const TOKEN = "secret-token-32-aaaaaaaaaaaaaaaaaaaa";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fakeFetchOk(status: number): typeof fetch {
    return vi.fn().mockResolvedValue(
      new Response(status === 200 ? '{"ok":true}' : '{"ok":false}', {
        status,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;
  }

  it("slug vazio → not_found sem fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await validateRegionalSlug("", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ kind: "not_found" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("apiBase ausente → unavailable com reason 'missing-backend-api-url'", async () => {
    const fetchImpl = vi.fn();
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: "",
      token: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ kind: "unavailable", reason: "missing-backend-api-url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("token ausente → unavailable com reason 'missing-internal-api-token'", async () => {
    const fetchImpl = vi.fn();
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: "",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ kind: "unavailable", reason: "missing-internal-api-token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("backend 200 → valid", async () => {
    const fetchImpl = fakeFetchOk(200);
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "valid" });
  });

  it("backend 404 → not_found", async () => {
    const fetchImpl = fakeFetchOk(404);
    const result = await validateRegionalSlug("regiao-fake-zz", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "not_found" });
  });

  it("backend 500 → unavailable com reason 'backend-5xx'", async () => {
    const fetchImpl = fakeFetchOk(500);
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toBe("backend-5xx");
    }
  });

  it("backend 401 → unavailable com reason 'backend-401'", async () => {
    const fetchImpl = fakeFetchOk(401);
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "unavailable", reason: "backend-401" });
  });

  it("backend 403 → unavailable com reason 'backend-403'", async () => {
    const fetchImpl = fakeFetchOk(403);
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "unavailable", reason: "backend-403" });
  });

  it("backend 429 (outro 4xx inesperado) → unavailable com reason 'backend-5xx'", async () => {
    const fetchImpl = fakeFetchOk(429);
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toBe("backend-5xx");
    }
  });

  it("fetch lança (rede offline) → unavailable com reason 'fetch-error'", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toBe("fetch-error");
      expect(result.detail).toContain("ECONNREFUSED");
    }
  });

  it("fetch abortado por timeout → unavailable com reason 'backend-timeout'", async () => {
    vi.useRealTimers();
    // Fetch que respeita o AbortSignal e rejeita com AbortError quando
    // sinalizado. Necessário simular o timeout real do AbortController.
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        const onAbort = () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort);
      });
    }) as unknown as typeof fetch;

    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      timeoutMs: 5,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "unavailable", reason: "backend-timeout" });
  });

  it("envia X-Internal-Token e encoda o slug", async () => {
    const fetchImpl = fakeFetchOk(200);
    await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBe(1);
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/internal/regions/atibaia-sp`);
    expect(init.headers).toMatchObject({ "X-Internal-Token": TOKEN });
    expect(init.method).toBe("GET");
  });

  it("remove trailing slash do apiBase para evitar // duplo", async () => {
    const fetchImpl = fakeFetchOk(200);
    await validateRegionalSlug("atibaia-sp", {
      apiBase: `${BASE}/`,
      token: TOKEN,
      fetchImpl,
    });
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const [url] = calls[0] as [string];
    expect(url).toBe(`${BASE}/api/internal/regions/atibaia-sp`);
  });
});

describe("decideRegionalMiddlewareAction — política de gate", () => {
  it("flag off → block-flag-off (independente da validação)", () => {
    const validation: SlugValidation = { kind: "valid" };
    expect(decideRegionalMiddlewareAction(false, validation)).toEqual({
      kind: "block-flag-off",
    });
  });

  it("flag off + not_found → ainda block-flag-off (flag tem precedência)", () => {
    const validation: SlugValidation = { kind: "not_found" };
    expect(decideRegionalMiddlewareAction(false, validation)).toEqual({
      kind: "block-flag-off",
    });
  });

  it("flag on + valid → pass-valid", () => {
    const validation: SlugValidation = { kind: "valid" };
    expect(decideRegionalMiddlewareAction(true, validation)).toEqual({
      kind: "pass-valid",
    });
  });

  it("flag on + not_found → block-not-found", () => {
    const validation: SlugValidation = { kind: "not_found" };
    expect(decideRegionalMiddlewareAction(true, validation)).toEqual({
      kind: "block-not-found",
    });
  });

  // O ANTI-REGRESSION CRÍTICO. Antes de 2026-05-11, este caminho retornava
  // pass-valid (fail-open). Resultado em produção: soft 404 para todo
  // slug regional quando env do backend estava mal configurado.
  // Nunca aceitar pass-* em estado unavailable.
  const UNAVAILABLE_REASONS = [
    "missing-backend-api-url",
    "missing-internal-api-token",
    "backend-401",
    "backend-403",
    "backend-5xx",
    "backend-timeout",
    "fetch-error",
  ] as const;

  for (const reason of UNAVAILABLE_REASONS) {
    it(`flag on + unavailable[${reason}] → block-unavailable (NUNCA pass)`, () => {
      const validation: SlugValidation = { kind: "unavailable", reason };
      const action = decideRegionalMiddlewareAction(true, validation);
      expect(action.kind).toBe("block-unavailable");
      if (action.kind === "block-unavailable") {
        expect(action.reason).toBe(reason);
      }
    });
  }

  it("garante que pass-valid é a ÚNICA saída que deixa a request seguir", () => {
    const states: SlugValidation[] = [
      { kind: "valid" },
      { kind: "not_found" },
      { kind: "unavailable", reason: "missing-backend-api-url" },
      { kind: "unavailable", reason: "missing-internal-api-token" },
      { kind: "unavailable", reason: "backend-401" },
      { kind: "unavailable", reason: "backend-403" },
      { kind: "unavailable", reason: "backend-5xx" },
      { kind: "unavailable", reason: "backend-timeout" },
      { kind: "unavailable", reason: "fetch-error" },
    ];
    const passCount = states
      .map((v) => decideRegionalMiddlewareAction(true, v))
      .filter((a) => a.kind === "pass-valid").length;
    expect(passCount).toBe(1);
  });
});
