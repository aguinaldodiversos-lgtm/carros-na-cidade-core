// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  decideAdDetailMiddlewareAction,
  extractAdDetailMatch,
  validateAdIdentifier,
} from "./ad-detail-gate";

describe("extractAdDetailMatch", () => {
  describe("/veiculo/[identifier]", () => {
    it.each([
      ["/veiculo/byd-dolphin-mini-eletrico-2026-1776912624710", "byd-dolphin-mini-eletrico-2026-1776912624710"],
      ["/veiculo/toyota-corolla-2020-campinas-sp", "toyota-corolla-2020-campinas-sp"],
      ["/veiculo/123456", "123456"],
      ["/veiculo/abc/", "abc"],
    ])("%s → route=veiculo identifier=%s", (path, expected) => {
      expect(extractAdDetailMatch(path)).toEqual({ route: "veiculo", identifier: expected });
    });

    it("ignora subrota /veiculo/X/Y", () => {
      expect(extractAdDetailMatch("/veiculo/abc/extra")).toBe(null);
    });

    it("ignora /veiculo sem identifier", () => {
      expect(extractAdDetailMatch("/veiculo")).toBe(null);
      expect(extractAdDetailMatch("/veiculo/")).toBe(null);
    });
  });

  describe("/anuncios/[identifier]", () => {
    it.each([
      ["/anuncios/byd-dolphin-mini-eletrico", "byd-dolphin-mini-eletrico"],
      ["/anuncios/999001", "999001"],
      ["/anuncios/slug-fantasma/", "slug-fantasma"],
    ])("%s → route=anuncios identifier=%s", (path, expected) => {
      expect(extractAdDetailMatch(path)).toEqual({ route: "anuncios", identifier: expected });
    });

    it("ignora subrota /anuncios/X/Y", () => {
      expect(extractAdDetailMatch("/anuncios/abc/extra")).toBe(null);
    });
  });

  describe("Não casa com outras rotas", () => {
    it.each([
      "/",
      "/comprar",
      "/comprar/estado/sp",
      "/carros-em/atibaia-sp",
      "/carros-usados/regiao/atibaia-sp",
      "/anunciar",
      "/anunciar/novo",
      "/simulador-financiamento/sao-paulo-sp",
    ])("%s → null", (path) => {
      expect(extractAdDetailMatch(path)).toBe(null);
    });
  });
});

describe("validateAdIdentifier", () => {
  const baseConfig = {
    apiBase: "https://backend.example.com",
    token: "INTERNAL_TOKEN_TEST",
    timeoutMs: 1000,
  };

  it("identifier vazio → not_found sem chamar fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await validateAdIdentifier("   ", { ...baseConfig, fetchImpl });
    expect(result).toEqual({ kind: "not_found" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("backend 200 → valid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await validateAdIdentifier("byd-dolphin-2026", { ...baseConfig, fetchImpl });
    expect(result).toEqual({ kind: "valid" });
  });

  it("backend 404 → not_found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const result = await validateAdIdentifier("anuncio-inexistente", { ...baseConfig, fetchImpl });
    expect(result).toEqual({ kind: "not_found" });
  });

  it("backend 410 Gone → not_found (briefing P1 2026-05-25 — semanticamente equivalente)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
    const result = await validateAdIdentifier("anuncio-removido", { ...baseConfig, fetchImpl });
    expect(result).toEqual({ kind: "not_found" });
  });

  it("backend 401 → unavailable(backend-401)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const result = await validateAdIdentifier("x", { ...baseConfig, fetchImpl });
    expect(result).toMatchObject({ kind: "unavailable", reason: "backend-401" });
  });

  it("backend 5xx → unavailable(backend-5xx)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const result = await validateAdIdentifier("x", { ...baseConfig, fetchImpl });
    expect(result).toMatchObject({ kind: "unavailable", reason: "backend-5xx" });
  });

  it("fetch erro de rede → unavailable(fetch-error)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await validateAdIdentifier("x", { ...baseConfig, fetchImpl });
    expect(result).toMatchObject({ kind: "unavailable", reason: "fetch-error" });
  });

  it("apiBase ausente → unavailable(missing-backend-api-url)", async () => {
    const fetchImpl = vi.fn();
    const result = await validateAdIdentifier("x", { token: "T", apiBase: "", fetchImpl });
    expect(result).toMatchObject({ kind: "unavailable", reason: "missing-backend-api-url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("token ausente → unavailable(missing-internal-api-token)", async () => {
    const fetchImpl = vi.fn();
    const result = await validateAdIdentifier("x", { apiBase: baseConfig.apiBase, token: "", fetchImpl });
    expect(result).toMatchObject({ kind: "unavailable", reason: "missing-internal-api-token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("monta URL com encoding de identifier", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await validateAdIdentifier("slug com espaço", { ...baseConfig, fetchImpl });
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toBe("https://backend.example.com/api/ads/slug%20com%20espa%C3%A7o");
  });

  it("envia headers UA cnc-internal/1.0 + X-Internal-Token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await validateAdIdentifier("abc", { ...baseConfig, fetchImpl });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["User-Agent"]).toBe("cnc-internal/1.0");
    expect(headers["X-Internal-Token"]).toBe(baseConfig.token);
  });
});

describe("decideAdDetailMiddlewareAction — política fail-open em unavailable", () => {
  it("valid → pass-valid", () => {
    expect(decideAdDetailMiddlewareAction({ kind: "valid" })).toEqual({ kind: "pass-valid" });
  });

  it("not_found → block-not-found (HTTP 404 real)", () => {
    expect(decideAdDetailMiddlewareAction({ kind: "not_found" })).toEqual({
      kind: "block-not-found",
    });
  });

  it.each([
    "missing-backend-api-url",
    "missing-internal-api-token",
    "backend-401",
    "backend-403",
    "backend-5xx",
    "backend-timeout",
    "fetch-error",
  ] as const)("unavailable(%s) → pass-unavailable (NÃO 503)", (reason) => {
    const action = decideAdDetailMiddlewareAction({ kind: "unavailable", reason });
    expect(action).toEqual({ kind: "pass-unavailable", reason });
  });
});
