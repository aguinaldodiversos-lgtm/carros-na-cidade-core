// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BFF PUT /api/ads/:id (edição de conteúdo do anúncio) — defesas:
 *   - exige autenticação (401, não chama backend);
 *   - recusa payload sem campos editáveis (400);
 *   - encaminha SOMENTE campos editáveis (title/price/description/mileage);
 *     NUNCA brand/model/year/city/state/status/advertiser_id;
 *   - propaga status/code do backend (ex.: 409 status travado, 403 terceiro).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

class FakeBackendApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(p: { message: string; status: number; code?: string; details?: unknown }) {
    super(p.message);
    this.name = "BackendApiError";
    this.status = p.status;
    this.code = p.code;
    this.details = p.details;
  }
}

function makeRequest(body: unknown) {
  return {
    headers: new Headers(),
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

function mockAuthOk() {
  vi.doMock("@/lib/http/bff-session", () => ({
    authenticateBffRequest: async () => ({
      ok: true,
      ctx: { session: { accessToken: "tok" }, backendHeaders: {} },
    }),
    applyBffCookies: (res: unknown) => res,
  }));
}

describe("BFF PUT /api/ads/:id", () => {
  it("401 quando sessão ausente — não chama updateOwnedAd", async () => {
    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({
        ok: false,
        response: new Response(JSON.stringify({ error: "Nao autenticado" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      }),
      applyBffCookies: (res: unknown) => res,
    }));
    const updateOwnedAd = vi.fn();
    vi.doMock("@/lib/account/backend-account", () => ({
      BackendApiError: FakeBackendApiError,
      updateOwnedAd,
      fetchOwnedAd: vi.fn(),
      patchOwnedAdStatus: vi.fn(),
      deleteOwnedAd: vi.fn(),
    }));

    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ price: 1000 }), { params: { id: "ad-1" } });
    expect(res.status).toBe(401);
    expect(updateOwnedAd).not.toHaveBeenCalled();
  });

  it("400 quando nenhum campo editável é enviado", async () => {
    mockAuthOk();
    const updateOwnedAd = vi.fn();
    vi.doMock("@/lib/account/backend-account", () => ({
      BackendApiError: FakeBackendApiError,
      updateOwnedAd,
      fetchOwnedAd: vi.fn(),
      patchOwnedAdStatus: vi.fn(),
      deleteOwnedAd: vi.fn(),
    }));

    const { PUT } = await import("./route");
    // brand/status são campos NÃO editáveis → filtrados → payload vazio.
    const res = await PUT(makeRequest({ brand: "Toyota", status: "active" }), {
      params: { id: "ad-1" },
    });
    expect(res.status).toBe(400);
    expect(updateOwnedAd).not.toHaveBeenCalled();
  });

  it("encaminha SOMENTE campos editáveis (descarta brand/status/advertiser_id)", async () => {
    mockAuthOk();
    const updateOwnedAd = vi.fn().mockResolvedValue({ success: true, data: { id: "ad-1" } });
    vi.doMock("@/lib/account/backend-account", () => ({
      BackendApiError: FakeBackendApiError,
      updateOwnedAd,
      fetchOwnedAd: vi.fn(),
      patchOwnedAdStatus: vi.fn(),
      deleteOwnedAd: vi.fn(),
    }));

    const { PUT } = await import("./route");
    const res = await PUT(
      makeRequest({
        title: "Honda Civic impecável",
        price: 79900,
        description: "Revisado",
        mileage: 42000,
        // campos que NÃO podem passar:
        brand: "Toyota",
        model: "Corolla",
        year: 2030,
        city_id: 99,
        status: "sold",
        advertiser_id: "adv-X",
      }),
      { params: { id: "ad-1" } }
    );

    expect(res.status).toBe(200);
    expect(updateOwnedAd).toHaveBeenCalledTimes(1);
    const [, adId, payload] = updateOwnedAd.mock.calls[0];
    expect(adId).toBe("ad-1");
    expect(payload).toEqual({
      title: "Honda Civic impecável",
      price: 79900,
      description: "Revisado",
      mileage: 42000,
    });
    expect(payload).not.toHaveProperty("brand");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("advertiser_id");
  });

  it("propaga 409 (status travado) com code do backend", async () => {
    mockAuthOk();
    const updateOwnedAd = vi.fn().mockRejectedValue(
      new FakeBackendApiError({
        message: "Este anúncio não pode ser editado no status atual.",
        status: 409,
        code: "AD_STATUS_NOT_EDITABLE",
        details: { status: "sold" },
      })
    );
    vi.doMock("@/lib/account/backend-account", () => ({
      BackendApiError: FakeBackendApiError,
      updateOwnedAd,
      fetchOwnedAd: vi.fn(),
      patchOwnedAdStatus: vi.fn(),
      deleteOwnedAd: vi.fn(),
    }));

    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ price: 1000 }), { params: { id: "ad-1" } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/não pode ser editado/i);
    expect(body.code).toBe("AD_STATUS_NOT_EDITABLE");
  });

  it("propaga 403 (terceiro tentando editar)", async () => {
    mockAuthOk();
    const updateOwnedAd = vi.fn().mockRejectedValue(
      new FakeBackendApiError({
        message: "Sem permissão para alterar este anúncio",
        status: 403,
      })
    );
    vi.doMock("@/lib/account/backend-account", () => ({
      BackendApiError: FakeBackendApiError,
      updateOwnedAd,
      fetchOwnedAd: vi.fn(),
      patchOwnedAdStatus: vi.fn(),
      deleteOwnedAd: vi.fn(),
    }));

    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ price: 1000 }), { params: { id: "ad-99" } });
    expect(res.status).toBe(403);
  });
});
