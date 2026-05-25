import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: () => "http://api.test",
  getInternalBackendApiBaseUrl: () => null,
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import { fetchPublicDealer } from "./fetch-public-dealer";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

const mockedFetch = ssrResilientFetch as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  mockedFetch.mockReset();
});

function dealerPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      dealer: {
        id: 7,
        slug: "auto-center-7",
        name: "Auto Center",
        verified: false,
        city: "Atibaia",
        state: "SP",
        city_slug: "atibaia-sp",
        total_active_ads: 3,
        ...overrides,
      },
      ads: [
        {
          id: 1,
          slug: "civic-2020-1",
          title: "Honda Civic 2020",
          price: 89900,
          city: "Atibaia",
          state: "SP",
          brand: "Honda",
          model: "Civic",
        },
        {
          id: 2,
          slug: "onix-2022-2",
          title: "Chevrolet Onix",
          price: 65000,
          city: "Atibaia",
          state: "SP",
          brand: "Chevrolet",
          model: "Onix",
        },
        {
          id: 3,
          slug: "gol-2018-3",
          title: "VW Gol",
          price: 0, // dropado pelo normalizePublicAd
          city: "Atibaia",
          state: "SP",
        },
      ],
    },
  };
}

describe("fetchPublicDealer — Lojas Públicas 2026-05-25", () => {
  it("retorna null em slug vazio", async () => {
    const out = await fetchPublicDealer("");
    expect(out).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("retorna null em 404 do backend (loja inexistente)", async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const out = await fetchPublicDealer("loja-inexistente");
    expect(out).toBeNull();
  });

  it("retorna null em erro de rede (exception)", async () => {
    mockedFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const out = await fetchPublicDealer("auto-center-7");
    expect(out).toBeNull();
  });

  it("retorna null quando payload não tem dealer válido", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { dealer: null, ads: [] } }),
    } as unknown as Response);
    const out = await fetchPublicDealer("auto-center-7");
    expect(out).toBeNull();
  });

  it("parsa dealer + filtra ad sem preço (price=0)", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => dealerPayload(),
    } as unknown as Response);

    const out = await fetchPublicDealer("auto-center-7");
    expect(out).not.toBeNull();
    expect(out?.dealer.id).toBe(7);
    expect(out?.dealer.slug).toBe("auto-center-7");
    expect(out?.dealer.name).toBe("Auto Center");
    expect(out?.dealer.city).toBe("Atibaia");
    expect(out?.dealer.state).toBe("SP");
    expect(out?.dealer.citySlug).toBe("atibaia-sp");
    // 3 ads vieram do backend, mas 1 tem price=0 → contrato público dropa.
    expect(out?.ads.length).toBe(2);
    expect(out?.dealer.totalActiveAds).toBe(2);
    // raw mantém os 3 (útil pra debug downstream).
    expect(out?.rawAds.length).toBe(3);
  });

  it("usa fallback de nome ('Loja parceira') quando backend manda name vazio", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => dealerPayload({ name: "" }),
    } as unknown as Response);

    const out = await fetchPublicDealer("auto-center-7");
    expect(out?.dealer.name).toBe("Loja parceira");
  });

  it("verified=true propaga para o payload", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => dealerPayload({ verified: true }),
    } as unknown as Response);

    const out = await fetchPublicDealer("auto-center-7");
    expect(out?.dealer.verified).toBe(true);
  });

  it("corrige encoding quebrado 'SÆo Paulo' → 'São Paulo' em city/name", async () => {
    // Caso real detectado pelo smoke pós-deploy 2026-05-25: backend
    // tinha city gravada com Latin-1 lido como UTF-8 ("SÆo Paulo"),
    // o que vazava como string proibida no HTML público.
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        dealerPayload({
          city: "SÆo Paulo",
          name: "Loja SÆo Paulo Motors",
        }),
    } as unknown as Response);

    const out = await fetchPublicDealer("loja-x");
    expect(out?.dealer.city).toBe("São Paulo");
    expect(out?.dealer.name).toBe("Loja São Paulo Motors");
    expect(`${out?.dealer.city} ${out?.dealer.name}`).not.toContain("SÆo");
  });
});
