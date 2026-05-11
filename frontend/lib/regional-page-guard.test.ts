import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REGIONAL_PATH_REGEX,
  extractRegionalSlug,
  isFlagEnabled,
  validateRegionalSlug,
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

  it("apiBase ausente → unavailable", async () => {
    const fetchImpl = vi.fn();
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: "",
      token: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.kind).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("token ausente → unavailable (não 404, para não confundir falta de config com slug inválido)", async () => {
    const fetchImpl = vi.fn();
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: "",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.kind).toBe("unavailable");
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

  it("backend 500 → unavailable (NÃO 404 falso-positivo)", async () => {
    const fetchImpl = fakeFetchOk(500);
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result.kind).toBe("unavailable");
  });

  it("backend 401/403 → unavailable (token errado na config, não slug inválido)", async () => {
    const fetchImpl401 = fakeFetchOk(401);
    const r401 = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl: fetchImpl401,
    });
    expect(r401.kind).toBe("unavailable");

    const fetchImpl403 = fakeFetchOk(403);
    const r403 = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl: fetchImpl403,
    });
    expect(r403.kind).toBe("unavailable");
  });

  it("fetch lança (rede offline) → unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const result = await validateRegionalSlug("atibaia-sp", {
      apiBase: BASE,
      token: TOKEN,
      fetchImpl,
    });
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("ECONNREFUSED");
    }
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
