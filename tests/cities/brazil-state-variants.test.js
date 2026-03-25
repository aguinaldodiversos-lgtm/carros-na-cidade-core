import { describe, it, expect } from "vitest";
import {
  stateColumnValuesForUf,
  stateRowMatchesUf,
} from "../../src/modules/cities/brazil-state-variants.js";

describe("stateColumnValuesForUf", () => {
  it("inclui código UF e nomes do estado para SP", () => {
    const v = stateColumnValuesForUf("sp");
    expect(v).toContain("SP");
    expect(v.some((x) => x.includes("PAULO"))).toBe(true);
  });

  it("aceita entrada com ruído", () => {
    const v = stateColumnValuesForUf(" SP ");
    expect(v).toContain("SP");
  });
});

describe("stateRowMatchesUf", () => {
  it("aceita linha com UF de duas letras", () => {
    expect(stateRowMatchesUf("SP", "SP")).toBe(true);
  });

  it("aceita linha com nome do estado", () => {
    expect(stateRowMatchesUf("SÃO PAULO", "SP")).toBe(true);
    expect(stateRowMatchesUf("SAO PAULO", "SP")).toBe(true);
  });

  it("rejeita estado de outra UF", () => {
    expect(stateRowMatchesUf("RJ", "SP")).toBe(false);
  });
});
