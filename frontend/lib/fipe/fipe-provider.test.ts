import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIPE_BRAND_SNAPSHOT } from "./fipe-brands-snapshot";
import { flattenFipeModelRows, getFipeBrands } from "./fipe-provider";

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
