import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: () => "http://api.test",
  getInternalBackendApiBaseUrl: () => null,
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

vi.mock("@/lib/vehicle/detail-utils", () => ({
  collectVehicleImageCandidates: (...args: unknown[]) =>
    args
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map((v) => String(v)),
}));

import { fetchAdDetail } from "./ad-detail";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

const mockedFetch = ssrResilientFetch as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  mockedFetch.mockReset();
});

describe("fetchAdDetail — regressão 2026-05-24", () => {
  it("retorna null quando NENHUM endpoint candidato encontra o anúncio", async () => {
    // Todos os 7 candidatos retornam !ok → null
    mockedFetch.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);

    const result = await fetchAdDetail("anuncio-inexistente");
    expect(result).toBeNull();
  });

  it("retorna null para identifier vazio", async () => {
    const result = await fetchAdDetail("");
    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("não monta payload fake 'Veículo não encontrado' com R$ 0", async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);

    const result = await fetchAdDetail("slug-fantasma");
    // O bug antigo retornava buildFallbackAd com title='Veículo não encontrado'
    // e city='São Paulo'. Agora caller pode chamar notFound() porque é null.
    expect(result).toBeNull();
  });

  it("retorna anúncio real quando o primeiro endpoint candidato responde", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 42,
          slug: "honda-civic-2020",
          title: "Honda Civic 2020",
          price: 89900,
          city: "Campinas",
          state: "SP",
          brand: "Honda",
          model: "Civic",
        },
      }),
    } as unknown as Response);

    const result = await fetchAdDetail("honda-civic-2020");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(42);
    expect(result?.slug).toBe("honda-civic-2020");
    expect(result?.price).toBe(89900);
    expect(result?.city).toBe("Campinas");
    expect(result?.state).toBe("SP");
  });

  it("propaga advertiser_slug quando backend emite (Lojas Públicas 2026-05-25)", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 42,
          slug: "honda-civic-2020",
          title: "Honda Civic",
          price: 89900,
          brand: "Honda",
          model: "Civic",
          advertiser_id: 7,
          advertiser_slug: "auto-center-7",
          seller_kind: "dealer",
        },
      }),
    } as unknown as Response);

    const result = await fetchAdDetail("honda-civic-2020");
    expect(result?.advertiser_slug).toBe("auto-center-7");
    expect(result?.seller_kind).toBe("dealer");
  });

  it("advertiser_slug aceita aliases legados (advertiserSlug / dealership_slug)", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 42,
          slug: "honda-civic-2020",
          title: "Honda Civic",
          price: 89900,
          advertiserSlug: "loja-x-99",
        },
      }),
    } as unknown as Response);

    const result = await fetchAdDetail("honda-civic-2020");
    expect(result?.advertiser_slug).toBe("loja-x-99");
  });

  it("NÃO defaulta city/state para 'São Paulo'/'SP' quando backend omite (briefing P0 2026-05-24)", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 42,
          slug: "honda-civic-sem-cidade",
          title: "Honda Civic",
          price: 89900,
          // city e state propositalmente omitidos do payload.
          brand: "Honda",
          model: "Civic",
        },
      }),
    } as unknown as Response);

    const result = await fetchAdDetail("honda-civic-sem-cidade");
    expect(result).not.toBeNull();
    // Antes: city="São Paulo", state="SP" (default sintético fake).
    // Agora: null — adapter `deriveCityDisplay` traduz para
    // "Localização não informada" na UI.
    expect(result?.city).toBeNull();
    expect(result?.state).toBeNull();
  });
});
