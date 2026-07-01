import { describe, it, expect } from "vitest";
import { validatePlanFields } from "../../src/modules/admin/plans/admin-plans.service.js";

/**
 * Etapa 1 — validação do PESO decimal do plano.
 *
 * Regras: weight decimal (2 casas), faixa 0 < weight < 4 (planos abaixo do
 * boost=4, reservado). Entrada com vírgula ("3,5") é convertida para ponto.
 */

describe("validatePlanFields — weight decimal", () => {
  it("aceita weight decimal 3.5 (entre Pro=3 e boost=4)", () => {
    const out = validatePlanFields({ weight: 3.5 }, { isCreate: false });
    expect(out.weight).toBe(3.5);
  });

  it("converte entrada com vírgula '3,5' para 3.5 (armazena com ponto)", () => {
    const out = validatePlanFields({ weight: "3,5" }, { isCreate: false });
    expect(out.weight).toBe(3.5);
  });

  it("aceita string com ponto '2.75'", () => {
    const out = validatePlanFields({ weight: "2.75" }, { isCreate: false });
    expect(out.weight).toBe(2.75);
  });

  it("arredonda para 2 casas decimais", () => {
    const out = validatePlanFields({ weight: 3.129 }, { isCreate: false });
    expect(out.weight).toBe(3.13);
  });

  it("REJEITA weight >= 4 (4 é reservado ao destaque pago) com mensagem clara", () => {
    expect(() => validatePlanFields({ weight: 4 }, { isCreate: false })).toThrow(
      /reservado ao destaque pago/i
    );
    expect(() => validatePlanFields({ weight: 4.5 }, { isCreate: false })).toThrow(
      /menor que 4/i
    );
  });

  it("REJEITA weight <= 0 com mensagem clara", () => {
    expect(() => validatePlanFields({ weight: 0 }, { isCreate: false })).toThrow(
      /maior que zero/i
    );
    expect(() => validatePlanFields({ weight: -1 }, { isCreate: false })).toThrow(
      /maior que zero/i
    );
  });

  it("REJEITA valor não-numérico", () => {
    expect(() => validatePlanFields({ weight: "abc" }, { isCreate: false })).toThrow(
      /maior que zero/i
    );
  });

  it("no create sem weight, default é 1 (piso do sistema)", () => {
    const out = validatePlanFields(
      {
        id: "cnpj-teste-x",
        name: "Teste",
        type: "CNPJ",
        price: 10,
        ad_limit: 5,
        priority_level: 10,
        billing_model: "monthly",
      },
      { isCreate: true }
    );
    expect(out.weight).toBe(1);
  });
});
