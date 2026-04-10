import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const VALID_CITY_RESPONSE = {
  success: true,
  data: {
    id: 42,
    name: "Atibaia",
    state: "SP",
    slug: "atibaia-sp",
  },
};

describe("fetchResolvedCityByIdFromBackend (publish city validation)", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.BACKEND_API_URL = "http://127.0.0.1:4000";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.BACKEND_API_URL;
  });

  async function importModule() {
    vi.resetModules();
    const mod = await import("../../frontend/lib/painel/create-ad-backend.ts");
    return mod;
  }

  it("returns ok:true with city data when backend responds 200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_CITY_RESPONSE,
    });

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    const result = await fetchResolvedCityByIdFromBackend(42, "SP");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.city.id).toBe(42);
      expect(result.city.name).toBe("Atibaia");
      expect(result.city.state).toBe("SP");
    }
  });

  it("returns reason:'not_found' when backend responds 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ success: false, message: "Cidade não encontrada." }),
    });

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    const result = await fetchResolvedCityByIdFromBackend(99999, "SP");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });

  it("returns reason:'rate_limited' when backend responds 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ success: false, message: "Muitas requisições." }),
    });

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    const result = await fetchResolvedCityByIdFromBackend(42, "SP");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limited");
      expect(result.status).toBe(429);
    }
  });

  it("returns reason:'backend_error' when backend responds 500", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false }),
    });

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    const result = await fetchResolvedCityByIdFromBackend(42, "SP");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("backend_error");
      expect(result.status).toBe(500);
    }
  });

  it("returns reason:'backend_error' when fetch throws network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    const result = await fetchResolvedCityByIdFromBackend(42, "SP");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("backend_error");
    }
  });

  it("forwards extra headers to backend fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_CITY_RESPONSE,
    });
    globalThis.fetch = mockFetch;

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    await fetchResolvedCityByIdFromBackend(42, "SP", {
      "X-Cnc-Client-Ip": "203.0.113.42",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders["X-Cnc-Client-Ip"]).toBe("203.0.113.42");
    expect(callHeaders["Accept"]).toBe("application/json");
  });

  it("handles bigint id from PostgreSQL (string in JSON) correctly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: "9007199254740993", name: "Atibaia", state: "SP", slug: "atibaia-sp" },
      }),
    });

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    const result = await fetchResolvedCityByIdFromBackend(42, "SP");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.city.name).toBe("Atibaia");
    }
  });

  it("uses fallbackUf when state is empty in response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 42, name: "Atibaia", state: "", slug: "atibaia-sp" },
      }),
    });

    const { fetchResolvedCityByIdFromBackend } = await importModule();
    const result = await fetchResolvedCityByIdFromBackend(42, "SP");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.city.state).toBe("SP");
    }
  });
});
