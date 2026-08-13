// Compatibilidade procura ↔ anúncio. Módulo puro, testado sem banco.
//
// Os cenários vêm dos §59 e §60 da especificação da Fase 3, com os valores
// REAIS de produção: `ads.model` guarda a descrição FIPE inteira, `ads.brand`
// pode vir com prefixo de grupo, e a procura guarda marca canônica + modelo
// comercial. Um teste que usasse "HR-V" nos dois lados provaria que a comparação
// de strings funciona — não que o casamento funciona sobre o dado que existe.

import { describe, expect, it } from "vitest";

import {
  budgetRelationOf,
  compareMatchingAds,
  evaluateAdForIntent,
  toPrice,
} from "../../src/modules/purchase-intents/purchase-intent-offers.matching.js";
import { BUDGET_RELATION } from "../../src/modules/purchase-intents/purchase-intent-offers.constants.js";

/** Procura: Honda HR-V automático até R$ 100.000 (§59). */
const SPECIFIC_INTENT = {
  intent_type: "specific_model",
  brand: "Honda",
  brand_slug: "honda",
  model: "HR-V",
  model_slug: "hr-v",
  body_type: null,
  transmission: "automatico",
  max_price: "100000.00",
};

/** Procura: SUV automático até R$ 100.000 (§60). */
const OPEN_INTENT = {
  intent_type: "open_category",
  brand: null,
  brand_slug: null,
  model: null,
  model_slug: null,
  body_type: "suv",
  transmission: "automatico",
  max_price: "100000.00",
};

function ad(overrides = {}) {
  return {
    id: 1,
    brand: "Honda",
    model: "HR-V EX 1.8 Flex 16V 5p Aut.",
    transmission: "automatico",
    body_type: "suv",
    price: "98900.00",
    ...overrides,
  };
}

describe("evaluateAdForIntent — specific_model", () => {
  it("A) HR-V automático 98k → elegível, dentro do orçamento", () => {
    const verdict = evaluateAdForIntent(ad({ price: "98000.00" }), SPECIFIC_INTENT);
    expect(verdict.eligible).toBe(true);
    expect(verdict.budgetRelation).toBe(BUDGET_RELATION.WITHIN);
  });

  it("B) HR-V automático 105k → ELEGÍVEL, acima do orçamento", () => {
    // O preço NÃO é bloqueador rígido aqui. Quem já sabe qual carro quer se
    // beneficia de ver o que existe um pouco acima do teto que digitou.
    const verdict = evaluateAdForIntent(ad({ price: "105000.00" }), SPECIFIC_INTENT);
    expect(verdict.eligible).toBe(true);
    expect(verdict.budgetRelation).toBe(BUDGET_RELATION.ABOVE);
  });

  it("C) HR-V MANUAL 95k → não elegível", () => {
    const verdict = evaluateAdForIntent(
      ad({ transmission: "manual", price: "95000.00" }),
      SPECIFIC_INTENT
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("transmission");
  });

  it("D) Honda CITY automático 90k → não elegível (modelo diferente)", () => {
    const verdict = evaluateAdForIntent(
      ad({ model: "CITY EX 1.5 Flex 16V 4p Aut.", price: "90000.00", body_type: "sedan" }),
      SPECIFIC_INTENT
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("model");
  });

  it("marca diferente com o mesmo nome de modelo não casa", () => {
    const verdict = evaluateAdForIntent(ad({ brand: "Jeep", model: "HR-V 1.8" }), SPECIFIC_INTENT);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("brand");
  });

  it("aceita a marca com prefixo de grupo da FIPE", () => {
    // "VW - VolksWagen" é como o catálogo entrega. A procura guarda
    // 'volkswagen'. Comparar cru não casaria — e o lojista com o carro certo
    // simplesmente não veria a oportunidade.
    const intent = {
      ...SPECIFIC_INTENT,
      brand: "Volkswagen",
      brand_slug: "volkswagen",
      model: "T-Cross",
      model_slug: "t-cross",
    };
    const verdict = evaluateAdForIntent(
      ad({ brand: "VW - VolksWagen", model: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut." }),
      intent
    );
    expect(verdict.eligible).toBe(true);
  });

  it("casa câmbio gravado fora do padrão canônico (dado legado)", () => {
    // Produção tem anúncio antigo com "Automático" acentuado. Normalizar os dois
    // lados é o comportamento correto — não uma concessão.
    const verdict = evaluateAdForIntent(ad({ transmission: "Automático" }), SPECIFIC_INTENT);
    expect(verdict.eligible).toBe(true);
  });

  it("modelo comercial indeterminável recusa (fail closed)", () => {
    // "1.0 12V Flex" começa por token de motorização: `deriveCommercialModel`
    // devolve null de propósito em vez de chutar "1.0" como modelo.
    const verdict = evaluateAdForIntent(ad({ model: "1.0 12V Flex 5p Mec." }), SPECIFIC_INTENT);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("model");
  });

  it("câmbio ilegível recusa (fail closed)", () => {
    const verdict = evaluateAdForIntent(ad({ transmission: null }), SPECIFIC_INTENT);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("transmission");
  });

  it("modelo comercial COMPOSTO não é cortado no primeiro token", () => {
    // Sem o mapa de compostos, "Corolla Cross" viraria "Corolla" e um Corolla
    // Cross apareceria para quem procura um Corolla.
    const intent = {
      ...SPECIFIC_INTENT,
      brand: "Toyota",
      brand_slug: "toyota",
      model: "Corolla",
      model_slug: "corolla",
    };
    const verdict = evaluateAdForIntent(
      ad({ brand: "Toyota", model: "Corolla Cross XRE 2.0 16V Flex Aut." }),
      intent
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("model");
  });
});

describe("evaluateAdForIntent — open_category", () => {
  it("A) SUV automático 95k → elegível", () => {
    const verdict = evaluateAdForIntent(ad({ price: "95000.00" }), OPEN_INTENT);
    expect(verdict.eligible).toBe(true);
    expect(verdict.budgetRelation).toBe(BUDGET_RELATION.WITHIN);
  });

  it("B) SUV automático 105k → NÃO elegível (aqui o orçamento é rígido)", () => {
    const verdict = evaluateAdForIntent(ad({ price: "105000.00" }), OPEN_INTENT);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("price");
  });

  it("C) SUV manual 90k → não elegível", () => {
    const verdict = evaluateAdForIntent(
      ad({ transmission: "manual", price: "90000.00" }),
      OPEN_INTENT
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("transmission");
  });

  it("D) Sedan automático 90k → não elegível", () => {
    const verdict = evaluateAdForIntent(
      ad({ body_type: "sedan", price: "90000.00" }),
      OPEN_INTENT
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("body_type");
  });

  it("marca e modelo são LIVRES neste modo", () => {
    const verdict = evaluateAdForIntent(
      ad({ brand: "Hyundai", model: "CRETA ACTION 1.6 16V Flex Aut.", price: "95000.00" }),
      OPEN_INTENT
    );
    expect(verdict.eligible).toBe(true);
  });

  it("preço exatamente no teto está DENTRO do orçamento", () => {
    const verdict = evaluateAdForIntent(ad({ price: "100000.00" }), OPEN_INTENT);
    expect(verdict.eligible).toBe(true);
    expect(verdict.budgetRelation).toBe(BUDGET_RELATION.WITHIN);
  });

  it("carroceria acentuada/legada é normalizada antes de comparar", () => {
    const verdict = evaluateAdForIntent(ad({ body_type: "Sedã" }), OPEN_INTENT);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("body_type");

    const suv = evaluateAdForIntent(ad({ body_type: "SUV" }), OPEN_INTENT);
    expect(suv.eligible).toBe(true);
  });

  it("preço ilegível recusa (fail closed)", () => {
    const verdict = evaluateAdForIntent(ad({ price: null }), OPEN_INTENT);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("price");
  });
});

describe("budgetRelationOf / toPrice", () => {
  it("NUMERIC do pg chega como string e é comparado como número", () => {
    expect(budgetRelationOf("98900.00", "100000.00")).toBe(BUDGET_RELATION.WITHIN);
    expect(budgetRelationOf("103900.00", "100000.00")).toBe(BUDGET_RELATION.ABOVE);
  });

  it("sem valor legível não existe classificação", () => {
    expect(budgetRelationOf(null, "100000.00")).toBeNull();
    expect(budgetRelationOf("98900.00", null)).toBeNull();
    expect(budgetRelationOf("abc", "100000.00")).toBeNull();
  });

  it("toPrice recusa negativo e texto vazio", () => {
    expect(toPrice("")).toBeNull();
    expect(toPrice("-1")).toBeNull();
    expect(toPrice(0)).toBe(0);
  });
});

describe("compareMatchingAds", () => {
  it("dentro do orçamento primeiro, depois preço crescente", () => {
    const rows = [
      { id: 1, price: "150000.00", budget_relation: BUDGET_RELATION.ABOVE },
      { id: 2, price: "98000.00", budget_relation: BUDGET_RELATION.WITHIN },
      { id: 3, price: "103000.00", budget_relation: BUDGET_RELATION.ABOVE },
      { id: 4, price: "72000.00", budget_relation: BUDGET_RELATION.WITHIN },
    ];
    expect([...rows].sort(compareMatchingAds).map((row) => row.id)).toEqual([4, 2, 3, 1]);
  });

  it("empate de preço tem desempate ESTÁVEL por id", () => {
    // Sem o terceiro critério, dois anúncios de mesmo preço trocariam de lugar
    // entre carregamentos e o lojista clicaria em "Enviar" no card errado.
    const rows = [
      { id: 7, price: "90000.00", budget_relation: BUDGET_RELATION.WITHIN },
      { id: 9, price: "90000.00", budget_relation: BUDGET_RELATION.WITHIN },
      { id: 8, price: "90000.00", budget_relation: BUDGET_RELATION.WITHIN },
    ];
    expect([...rows].sort(compareMatchingAds).map((row) => row.id)).toEqual([9, 8, 7]);
  });

  it("preço ilegível vai para o fim", () => {
    const rows = [
      { id: 1, price: null, budget_relation: null },
      { id: 2, price: "98000.00", budget_relation: BUDGET_RELATION.WITHIN },
    ];
    expect([...rows].sort(compareMatchingAds).map((row) => row.id)).toEqual([2, 1]);
  });
});
