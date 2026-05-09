import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseFipePriceBr,
  quoteByCodes,
  __resetFipeProviderCache,
  __fipeProviderCacheSize,
} from "../../src/modules/fipe/fipe.provider.js";

beforeEach(() => {
  __resetFipeProviderCache();
  delete process.env.FIPE_BACKEND_DISABLED;
});

describe("parseFipePriceBr — parse de moeda BR", () => {
  it("aceita 'R$ 85.123,45'", () => {
    expect(parseFipePriceBr("R$ 85.123,45")).toBe(85123.45);
  });
  it("aceita 'R$85123,45' / '85.123,45' / numero direto (formato BR)", () => {
    // A FIPE oficial sempre devolve "R$ 85.123,45" (ponto=milhar, vírgula=decimal).
    // Não nos preocupamos com formato "85123.45" porque não é input que vem do
    // provider — o caller passa string do response ou número direto.
    expect(parseFipePriceBr("R$85123,45")).toBe(85123.45);
    expect(parseFipePriceBr("85.123,45")).toBe(85123.45);
    expect(parseFipePriceBr(85123.45)).toBe(85123.45);
    expect(parseFipePriceBr("85123")).toBe(85123);
  });
  it("retorna null para string vazia, valores zero/negativo, lixo", () => {
    expect(parseFipePriceBr("")).toBe(null);
    expect(parseFipePriceBr("0")).toBe(null);
    expect(parseFipePriceBr("-100")).toBe(null);
    expect(parseFipePriceBr("indisponível")).toBe(null);
    expect(parseFipePriceBr(null)).toBe(null);
  });
});

describe("quoteByCodes — chamada HTTP server-side", () => {
  it("retorna ok=false sem códigos", async () => {
    const r = await quoteByCodes({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_codes");
  });

  it("respeita FIPE_BACKEND_DISABLED=true (não toca rede)", async () => {
    process.env.FIPE_BACKEND_DISABLED = "true";
    const fetchSpy = vi.fn();
    const r = await quoteByCodes(
      { brandCode: "23", modelCode: "5585", yearCode: "2018-1" },
      { fetch: fetchSpy }
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("disabled_by_env");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ok=true quando provider responde com Valor parseável", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Valor: "R$ 85.123,00",
        CodigoFipe: "001234-5",
        MesReferencia: "maio de 2026",
      }),
    }));

    const r = await quoteByCodes(
      { brandCode: "23", modelCode: "5585", yearCode: "2018-1" },
      { fetch: fakeFetch }
    );
    expect(r.ok).toBe(true);
    expect(r.price).toBe(85123);
    expect(r.fipeCode).toBe("001234-5");
    expect(r.referenceMonth).toContain("maio");
    expect(r.fromCache).toBe(false);
  });

  it("usa cache no segundo hit (sem nova chamada de rede)", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ Valor: "R$ 50.000,00", CodigoFipe: "x" }),
    }));

    const codes = { brandCode: "1", modelCode: "2", yearCode: "2020-1" };
    await quoteByCodes(codes, { fetch: fakeFetch });
    expect(__fipeProviderCacheSize()).toBe(1);

    const r2 = await quoteByCodes(codes, { fetch: fakeFetch });
    expect(r2.ok).toBe(true);
    expect(r2.fromCache).toBe(true);
    expect(fakeFetch).toHaveBeenCalledTimes(1); // segunda foi cache
  });

  it("provider 404 → reason='provider_error' status=404", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    const r = await quoteByCodes(
      { brandCode: "1", modelCode: "9", yearCode: "1900-1" },
      { fetch: fakeFetch }
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("provider_error");
    expect(r.status).toBe(404);
  });

  it("network error / timeout → reason='network_error'", async () => {
    const fakeFetch = vi.fn(async () => {
      const e = new Error("connect ETIMEDOUT");
      throw e;
    });
    const r = await quoteByCodes(
      { brandCode: "1", modelCode: "2", yearCode: "2020-1" },
      { fetch: fakeFetch }
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network_error");
  });

  it("response sem Valor parseável → reason='no_price_in_response'", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ Valor: "indisponivel" }),
    }));
    const r = await quoteByCodes(
      { brandCode: "1", modelCode: "2", yearCode: "2020-1" },
      { fetch: fakeFetch }
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_price_in_response");
  });
});
