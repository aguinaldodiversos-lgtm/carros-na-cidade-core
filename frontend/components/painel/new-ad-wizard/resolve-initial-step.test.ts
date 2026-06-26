import { describe, it, expect } from "vitest";
import { resolveInitialStep } from "./resolve-initial-step";
import { STEP_COUNT } from "./types";

describe("resolveInitialStep", () => {
  it("começa em Veículo (0) quando não há ?step= na URL", () => {
    // Regressão do bug: rascunho abandonado em localStorage NÃO deve mais
    // fazer um novo anúncio reabrir no passo Preço — o passo só vem da URL.
    expect(resolveInitialStep(null)).toBe(0);
    expect(resolveInitialStep(undefined)).toBe(0);
    expect(resolveInitialStep("")).toBe(0);
  });

  it("respeita ?step= explícito e válido (1-indexado → 0-indexado)", () => {
    expect(resolveInitialStep("1")).toBe(0); // Veículo
    expect(resolveInitialStep("2")).toBe(1); // Preço
    expect(resolveInitialStep("5")).toBe(STEP_COUNT - 1); // Revisão
  });

  it("ignora ?step= inválido/fora do intervalo e cai em Veículo (0)", () => {
    expect(resolveInitialStep("0")).toBe(0);
    expect(resolveInitialStep("6")).toBe(0); // > STEP_COUNT
    expect(resolveInitialStep("-1")).toBe(0);
    expect(resolveInitialStep("abc")).toBe(0);
    expect(resolveInitialStep("2.9")).toBe(1); // parseInt → 2 → índice 1
  });
});
