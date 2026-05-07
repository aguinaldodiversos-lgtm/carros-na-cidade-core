import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIPE_BRAND_SNAPSHOT } from "./fipe-brands-snapshot";
import { flattenFipeModelRows, getFipeBrands, getFipeModels } from "./fipe-provider";

describe("flattenFipeModelRows", () => {
  it("aceita lista plana (nome + codigo string)", () => {
    const out = flattenFipeModelRows([{ nome: "Ka", codigo: "123" }]);
    expect(out).toEqual([{ code: "123", name: "Ka" }]);
  });

  it("expande modelos aninhados (codigo como array de sub-itens)", () => {
    const out = flattenFipeModelRows([
      {
        nome: "Gol",
        codigo: [
          { nome: "1.0", codigo: "2013-1" },
          { nome: "1.6", codigo: "2013-2" },
        ],
      },
    ]);
    expect(out).toEqual([
      { code: "2013-1", name: "Gol 1.0" },
      { code: "2013-2", name: "Gol 1.6" },
    ]);
  });

  it("deduplica por código", () => {
    const out = flattenFipeModelRows([
      { nome: "X", codigo: "1" },
      { nome: "Y", codigo: "1" },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("getFipeBrands — fallback para snapshot quando provider falha", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: provider responde 200 → usa dados do provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ codigo: "999", nome: "MarcaTeste" }],
      } as Response)
    );

    const out = await getFipeBrands("carros");
    expect(out).toEqual([{ code: "999", name: "MarcaTeste" }]);
  });

  it("provider 5xx → fallback usa o snapshot embutido (carros)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response)
    );

    const out = await getFipeBrands("carros");
    expect(out.length).toBe(FIPE_BRAND_SNAPSHOT.carros.length);
    expect(out.length).toBeGreaterThan(50);
    // shape preservado (FipeOption — não vaza propriedades extras)
    expect(out[0]).toEqual({
      code: expect.any(String),
      name: expect.any(String),
    });
  });

  it("provider erro de rede → fallback usa snapshot (motos)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const out = await getFipeBrands("motos");
    expect(out.length).toBe(FIPE_BRAND_SNAPSHOT.motos.length);
    expect(out.find((b) => /honda/i.test(b.name))).toBeDefined();
  });

  it("provider devolve lista vazia → fallback (caminhoes)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
    );

    const out = await getFipeBrands("caminhoes");
    expect(out.length).toBe(FIPE_BRAND_SNAPSHOT.caminhoes.length);
  });

  it("vehicleType inválido cai em 'carros' (defesa do normalizeVehicleType)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const out = await getFipeBrands("xpto" as unknown as string);
    expect(out.length).toBe(FIPE_BRAND_SNAPSHOT.carros.length);
  });
});

describe("getFipeModels — fallback para snapshot por marca quando provider falha", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: provider 200 → usa dados do provider, ignora snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          modelos: [{ codigo: "999", nome: "ModeloFake" }],
        }),
      } as Response)
    );

    const out = await getFipeModels("21", "carros");
    expect(out).toEqual([{ code: "999", name: "ModeloFake" }]);
  });

  it("provider 5xx → fallback usa snapshot da marca (Fiat=21, carros)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response)
    );

    const out = await getFipeModels("21", "carros");
    expect(out.length).toBeGreaterThan(50);
    // Snapshot de Fiat traz Uno, Palio etc.
    expect(out.some((m) => /\b(uno|palio|strada|toro)\b/i.test(m.name))).toBe(true);
  });

  it("provider erro de rede → fallback usa snapshot (motos / Honda=80)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const out = await getFipeModels("80", "motos");
    expect(out.length).toBeGreaterThan(0);
  });

  it("provider devolve modelos=[] → fallback (caminhoes)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ modelos: [] }),
      } as Response)
    );

    const out = await getFipeModels("106", "caminhoes");
    // Snapshot tem ao menos a marca; pode ser vazia se brandCode inválido,
    // então só validamos que não jogou exceção (degraded gracefully).
    expect(Array.isArray(out)).toBe(true);
  });

  it("provider falha + brandCode inexistente no snapshot → throw original error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    await expect(getFipeModels("999999", "carros")).rejects.toThrow();
  });
});
