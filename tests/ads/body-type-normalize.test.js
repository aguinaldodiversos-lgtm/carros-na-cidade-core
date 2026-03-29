import { describe, it, expect } from "vitest";
import { normalizeBodyTypeForStorage } from "../../src/modules/ads/ads.body-type.normalize.js";

describe("normalizeBodyTypeForStorage", () => {
  it("mapeia rótulos PT-BR para slugs do CHECK (ex.: Sedã → sedan)", () => {
    expect(normalizeBodyTypeForStorage("Sedã")).toBe("sedan");
    expect(normalizeBodyTypeForStorage("sedan")).toBe("sedan");
    expect(normalizeBodyTypeForStorage("SUV")).toBe("suv");
    expect(normalizeBodyTypeForStorage("Picape")).toBe("picape");
  });

  it("retorna null para vazio", () => {
    expect(normalizeBodyTypeForStorage(null)).toBe(null);
    expect(normalizeBodyTypeForStorage("")).toBe(null);
    expect(normalizeBodyTypeForStorage("   ")).toBe(null);
  });

  it("usa sedan como fallback seguro", () => {
    expect(normalizeBodyTypeForStorage("valor-desconhecido-xyz")).toBe("sedan");
  });
});
