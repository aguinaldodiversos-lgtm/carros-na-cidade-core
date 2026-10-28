// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchVerifiedPublicBoost } from "./public-boost";

vi.mock("@/lib/env/backend-api", () => ({
  resolveInternalBackendApiUrl: () => "http://backend.local/api/public/commercial/boost",
}));
vi.mock("@/lib/http/internal-backend-headers", () => ({
  buildInternalBackendHeaders: () => ({
    "User-Agent": "cnc-internal/1.0",
    "X-Internal-Token": "fixture-token",
  }),
}));

const confirmedBoost = {
  id: "boost-7d",
  name: "Destaque 7 dias",
  description: "Topo das listagens por 7 dias",
  price_cents: 3990,
  duration_days: 7,
  active: true,
};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("Consulta verificada do Destaque no servidor", () => {
  it("autentica SSR no backend e retorna configuração comercial confirmada", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ boost: confirmedBoost }),
    } as Response);
    vi.stubGlobal("fetch", spy);
    await expect(fetchVerifiedPublicBoost()).resolves.toEqual(confirmedBoost);
    expect(spy).toHaveBeenCalledWith(
      "http://backend.local/api/public/commercial/boost",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          "User-Agent": "cnc-internal/1.0",
          "X-Internal-Token": "fixture-token",
        }),
      })
    );
  });

  it("falha fechada em HTTP 429, sem anunciar preço desatualizado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response));
    await expect(fetchVerifiedPublicBoost()).resolves.toBeNull();
  });

  it("não aceita contrato comercial incompleto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ boost: { price_cents: 3990, active: true } }),
      } as Response)
    );
    await expect(fetchVerifiedPublicBoost()).resolves.toBeNull();
  });
});
