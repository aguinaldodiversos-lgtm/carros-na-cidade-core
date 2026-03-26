import { describe, it, expect } from "vitest";
import { inferUfFromSlug } from "../../src/shared/utils/inferUfFromSlug.js";

describe("inferUfFromSlug", () => {
  it("extrai UF do final do slug (hífen ou underscore + duas letras)", () => {
    expect(inferUfFromSlug("atibaia-sp")).toBe("SP");
    expect(inferUfFromSlug("atibaia_sp")).toBe("SP");
    expect(inferUfFromSlug("sao-paulo-sp")).toBe("SP");
  });

  it("retorna string vazia quando não há sufixo -uf", () => {
    expect(inferUfFromSlug("atibaia")).toBe("");
    expect(inferUfFromSlug("")).toBe("");
    expect(inferUfFromSlug(null)).toBe("");
  });
});
