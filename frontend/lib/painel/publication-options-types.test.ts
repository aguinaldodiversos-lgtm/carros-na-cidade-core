import { describe, it, expect } from "vitest";

import { formatBrlFromCents } from "./publication-options-types";

/**
 * Defesa contra refactor que reintroduza cálculo de preço no client.
 * O contrato é: backend manda price_cents (inteiro), client só formata.
 */
describe("formatBrlFromCents — apenas formatação, nunca cálculo", () => {
  it("3990 → R$ 39,90", () => {
    expect(formatBrlFromCents(3990)).toMatch(/39,90/);
  });

  it("7990 → R$ 79,90", () => {
    expect(formatBrlFromCents(7990)).toMatch(/79,90/);
  });

  it("14990 → R$ 149,90", () => {
    expect(formatBrlFromCents(14990)).toMatch(/149,90/);
  });

  it("0 → R$ 0,00", () => {
    expect(formatBrlFromCents(0)).toMatch(/0,00/);
  });

  it("NaN/Infinity → '—' (não tenta inferir)", () => {
    expect(formatBrlFromCents(NaN)).toBe("—");
    expect(formatBrlFromCents(Infinity)).toBe("—");
  });
});
