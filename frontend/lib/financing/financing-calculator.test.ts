import { describe, expect, it } from "vitest";
import {
  calculateFinancingAmounts,
  calculateMonthlyPayment,
  DEFAULT_MONTHLY_RATE,
  FINANCING_PROVISION_PCT,
} from "./financing-calculator";

describe("simulador Price — taxa inicial e provisão adicional", () => {
  it("inicia em 1,80% a.m. e usa a provisão comercial de 3,373%", () => {
    expect(DEFAULT_MONTHLY_RATE).toBe(1.8);
    expect(FINANCING_PROVISION_PCT).toBe(3.373);
  });

  it("aplica 3,373% apenas sobre o saldo líquido após entrada, uma única vez", () => {
    const amounts = calculateFinancingAmounts(94900, 20000);
    expect(amounts).toEqual({
      financedBase: 74900,
      additionalProvision: 2526.38,
      financedWithProvision: 77426.38,
    });
  });

  it("simula 60x coerentes com o total financiado e taxa inicial", () => {
    const amounts = calculateFinancingAmounts(94900, 20000);
    const installment = calculateMonthlyPayment(
      amounts.financedWithProvision,
      DEFAULT_MONTHLY_RATE,
      60
    );
    expect(installment).toBe(2120.86);
    expect(Number((installment * 60 + 20000).toFixed(2))).toBe(147251.6);
  });

  it("continua permitindo taxas editadas sem multiplicar provisão novamente", () => {
    const { financedWithProvision } = calculateFinancingAmounts(94900, 20000);
    expect(calculateMonthlyPayment(financedWithProvision, 1.29, 60)).toBe(1861.53);
    expect(calculateMonthlyPayment(financedWithProvision, 1.8, 60)).toBe(2120.86);
  });

  it("respeita prazo e entrada integral, inclusive parcela zero", () => {
    const zero = calculateFinancingAmounts(94900, 94900);
    expect(zero.additionalProvision).toBe(0);
    expect(zero.financedWithProvision).toBe(0);
    expect(calculateMonthlyPayment(zero.financedWithProvision, 1.8, 60)).toBe(0);
    expect(calculateMonthlyPayment(12000, 0, 12)).toBe(1000);
  });

  it("rejeita juros negativos e entradas numéricas inválidas", () => {
    expect(calculateMonthlyPayment(10000, -0.1, 36)).toBe(0);
    expect(calculateMonthlyPayment(Infinity, 1.8, 60)).toBe(0);
    expect(calculateMonthlyPayment(10000, 1.8, 0)).toBe(0);
  });
});
