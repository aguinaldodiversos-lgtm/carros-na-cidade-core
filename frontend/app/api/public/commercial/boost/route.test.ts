// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BFF público GET /api/public/commercial/boost.
 *
 * Garante:
 *   - encaminha ao backend e devolve 200 JSON com o boost (sem exigir auth);
 *   - reflete price_cents/duration_days do backend (platform_settings);
 *   - fallback 200 (nunca 404/5xx) quando backend falha ou base ausente.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

describe("BFF /api/public/commercial/boost", () => {
  it("200 JSON com boost do backend, sem exigir autenticação", async () => {
    vi.doMock("@/lib/env/backend-api", () => ({
      resolveInternalBackendApiUrl: () => "http://backend.local/api/public/commercial/boost",
    }));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        boost: {
          id: "boost-7d",
          name: "Destaque 7 dias",
          description: "x",
          price_cents: 3990,
          duration_days: 7,
          active: true,
        },
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.boost).toMatchObject({
      id: "boost-7d",
      price_cents: 3990,
      duration_days: 7,
      active: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("reflete edição admin (preço/dias diferentes vindos do backend)", async () => {
    vi.doMock("@/lib/env/backend-api", () => ({
      resolveInternalBackendApiUrl: () => "http://backend.local/api/public/commercial/boost",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          boost: { id: "boost-7d", price_cents: 4990, duration_days: 14, active: true },
        }),
      } as Response)
    );

    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.boost.price_cents).toBe(4990);
    expect(body.boost.duration_days).toBe(14);
  });

  it("200 com fallback quando backend responde !ok (nunca 404/5xx)", async () => {
    vi.doMock("@/lib/env/backend-api", () => ({
      resolveInternalBackendApiUrl: () => "http://backend.local/api/public/commercial/boost",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)
    );

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.boost.id).toBe("boost-7d");
    expect(body.boost.price_cents).toBe(3990);
  });

  it("200 com fallback quando base do backend não configurada (sem fetch)", async () => {
    vi.doMock("@/lib/env/backend-api", () => ({
      resolveInternalBackendApiUrl: () => "",
    }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.boost.id).toBe("boost-7d");
  });
});
