// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { fetchPlans } from "@/lib/account/backend-account";
import { getPlans } from "@/lib/plans/plan-store";

vi.mock("@/lib/account/backend-account", () => ({
  fetchPlans: vi.fn(),
}));
vi.mock("@/lib/plans/plan-store", () => ({
  getPlans: vi.fn(() => [{ id: "cnpj-store-start", price: 79.9, is_active: true }]),
}));

const request = (query = "") =>
  new NextRequest(`http://localhost/api/plans${query ? "?" + query : ""}`);

beforeEach(() => {
  vi.mocked(fetchPlans).mockReset();
  vi.mocked(getPlans).mockClear();
});

describe("catálogo comercial confirmado — /api/plans", () => {
  it("quando API responde, publica os dados vigentes sem cache", async () => {
    vi.mocked(fetchPlans).mockResolvedValueOnce([
      { id: "cnpj-store-start", price: 89.9, is_active: true },
    ] as never);
    const response = await GET(request("verified=1"));
    expect(response.status).toBe(200);
    expect((await response.json()).plans[0].price).toBe(89.9);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getPlans).not.toHaveBeenCalled();
  });

  it("falha de backend retorna 503 no modo verificado, sem preço de fallback", async () => {
    vi.mocked(fetchPlans).mockRejectedValueOnce(new Error("backend fora"));
    const response = await GET(request("verified=1"));
    expect(response.status).toBe(503);
    expect((await response.json()).plans).toBeUndefined();
    expect(getPlans).not.toHaveBeenCalled();
  });

  it("mantém fallback para consumidores legados que não pedem preços confirmados", async () => {
    vi.mocked(fetchPlans).mockRejectedValueOnce(new Error("backend fora"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).plans[0].id).toBe("cnpj-store-start");
    expect(getPlans).toHaveBeenCalledTimes(1);
  });
});
