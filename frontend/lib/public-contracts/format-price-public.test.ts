// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatPricePublic } from "./format-price-public";

describe("formatPricePublic — briefing P2 2026-05-25", () => {
  describe("preço válido", () => {
    it.each([
      [89900, /R\$\s89\.900/],
      [105_900, /R\$\s105\.900/],
      [12345, /R\$\s12\.345/],
      [50, /R\$\s50/],
    ])("número %d → %s", (price, expected) => {
      expect(formatPricePublic(price)).toMatch(expected);
    });

    it("aceita string crua '89900'", () => {
      expect(formatPricePublic("89900")).toMatch(/R\$\s89\.900/);
    });

    it("aceita string pt-BR formatada 'R$ 89.900'", () => {
      // bug histórico: parseFloat após strip de chars não-decimais virava
      // 89.9 → "R$ 90". Helper precisa entender milhares pt-BR.
      expect(formatPricePublic("R$ 89.900")).toMatch(/R\$\s89\.900/);
    });

    it("aceita string pt-BR com centavos 'R$ 89.900,00'", () => {
      expect(formatPricePublic("R$ 89.900,00")).toMatch(/R\$\s89\.900/);
    });
  });

  describe("preço ausente — nunca 'R$ 0'", () => {
    it.each([null, undefined, 0, "0", "R$ 0", "", "   "])("entrada %j → 'Sob consulta'", (input) => {
      const out = formatPricePublic(input as never);
      expect(out).toBe("Sob consulta");
      expect(out).not.toMatch(/R\$\s?0[^0-9]/);
    });

    it("respeita whenAbsent='empty'", () => {
      expect(formatPricePublic(0, { whenAbsent: "empty" })).toBe("");
    });

    it("respeita whenAbsent='null'", () => {
      expect(formatPricePublic(null, { whenAbsent: "null" })).toBeNull();
    });
  });

  describe("nunca double-format", () => {
    it("string '89.9' (decimal) NÃO vira '89 reais'", () => {
      // 89.9 com ponto decimal → 90 (arredondamento maximumFractionDigits=0)
      expect(formatPricePublic(89.9)).toMatch(/R\$\s90/);
    });

    it("string '89.900' (milhares pt-BR) preserva 89.900", () => {
      expect(formatPricePublic("89.900")).toMatch(/R\$\s89\.900/);
    });
  });

  describe("NaN/Infinity defensivos", () => {
    it("NaN → 'Sob consulta'", () => {
      expect(formatPricePublic(Number.NaN)).toBe("Sob consulta");
    });
    it("Infinity → 'Sob consulta'", () => {
      expect(formatPricePublic(Number.POSITIVE_INFINITY)).toBe("Sob consulta");
    });
  });
});
