import { describe, expect, it } from "vitest";

import { hasRealPrice } from "@/lib/ads/has-real-price";

describe("hasRealPrice — filtro anti-placeholder R$ 0", () => {
  it("rejeita preço null", () => {
    expect(hasRealPrice({ price: null })).toBe(false);
  });

  it("rejeita preço undefined", () => {
    expect(hasRealPrice({})).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(hasRealPrice({ price: "" })).toBe(false);
  });

  it("rejeita zero numérico", () => {
    expect(hasRealPrice({ price: 0 })).toBe(false);
  });

  it("rejeita zero em string", () => {
    expect(hasRealPrice({ price: "0" })).toBe(false);
  });

  it("rejeita 'R$ 0' (formato BR)", () => {
    expect(hasRealPrice({ price: "R$ 0" })).toBe(false);
  });

  it("rejeita 'R$ 0,00'", () => {
    expect(hasRealPrice({ price: "R$ 0,00" })).toBe(false);
  });

  it("aceita 65000", () => {
    expect(hasRealPrice({ price: 65000 })).toBe(true);
  });

  it("aceita 'R$ 65.000'", () => {
    expect(hasRealPrice({ price: "R$ 65.000" })).toBe(true);
  });

  it("aceita '65000.00'", () => {
    expect(hasRealPrice({ price: "65000.00" })).toBe(true);
  });

  it("aceita string com vírgula decimal", () => {
    expect(hasRealPrice({ price: "65000,50" })).toBe(true);
  });

  it("rejeita preço negativo", () => {
    expect(hasRealPrice({ price: -100 })).toBe(false);
  });

  it("filtra mistura de placeholders e reais via Array.filter", () => {
    const lista = [
      { id: 1, price: 65000 },
      { id: 2, price: 0 },
      { id: 3, price: "R$ 0" },
      { id: 4, price: "R$ 38.900" },
      { id: 5, price: null },
    ];
    expect(lista.filter(hasRealPrice).map((a) => a.id)).toEqual([1, 4]);
  });
});
