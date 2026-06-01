import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resilientFetch: vi.fn(),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: mocks.resilientFetch,
}));

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: () => "https://backend.example.com",
  getInternalBackendApiBaseUrl: () => "",
}));

import { fetchHomeHero } from "./public-home";

function ok(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  mocks.resilientFetch.mockReset();
});

describe("fetchHomeHero (Fase 4.1.1)", () => {
  it("retorna [] quando data está vazio", async () => {
    mocks.resilientFetch.mockResolvedValue(
      ok({ success: true, data: { banners: [] } })
    );
    const out = await fetchHomeHero();
    expect(out).toEqual([]);
  });

  it("filtra inativos defensivamente e ordena por position", async () => {
    mocks.resilientFetch.mockResolvedValue(
      ok({
        success: true,
        data: {
          banners: [
            { position: 3, is_active: true, title: "C", updated_at: "", version: 1 },
            { position: 1, is_active: true, title: "A", updated_at: "", version: 1 },
            { position: 2, is_active: false, title: "B-inativo", updated_at: "", version: 1 },
          ],
        },
      })
    );
    const out = await fetchHomeHero();
    expect(out.map((b) => b.position)).toEqual([1, 3]);
  });

  it("limita a 3 banners", async () => {
    mocks.resilientFetch.mockResolvedValue(
      ok({
        success: true,
        data: {
          banners: [
            { position: 1, is_active: true, updated_at: "", version: 1 },
            { position: 2, is_active: true, updated_at: "", version: 1 },
            { position: 3, is_active: true, updated_at: "", version: 1 },
            { position: 4, is_active: true, updated_at: "", version: 1 },
          ],
        },
      })
    );
    const out = await fetchHomeHero();
    expect(out).toHaveLength(3);
  });

  it("retorna [] quando fetch falha", async () => {
    mocks.resilientFetch.mockRejectedValue(new Error("network"));
    expect(await fetchHomeHero()).toEqual([]);
  });

  it("retorna [] quando success=false", async () => {
    mocks.resilientFetch.mockResolvedValue(ok({ success: false }));
    expect(await fetchHomeHero()).toEqual([]);
  });
});
