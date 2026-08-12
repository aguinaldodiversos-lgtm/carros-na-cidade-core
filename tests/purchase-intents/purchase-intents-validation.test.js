// Validação das procuras — unidade pura, sem banco e sem HTTP.
//
// O que estes testes protegem: o dado GRAVADO. A Fase 3 vai comparar procura com
// anúncio, e a comparação só funciona se as duas pontas usarem o mesmo
// vocabulário — slug de câmbio sem acento, marca sem prefixo de grupo FIPE,
// modelo comercial em vez da descrição FIPE inteira. Um valor "quase certo"
// aqui não quebra nada hoje e quebra o matching inteiro depois.

import { describe, expect, it } from "vitest";

import {
  PURCHASE_INTENT_LIMITS,
  PURCHASE_INTENT_PAGE,
  PURCHASE_INTENT_TYPE,
  PURCHASE_TIMEFRAME,
} from "../../src/modules/purchase-intents/purchase-intents.constants.js";
import {
  decodeCursor,
  encodeCursor,
  parseCityId,
  parseLimit,
  parsePurchaseIntentId,
  validateBodyType,
  validateBrand,
  validateIntentType,
  validateMaxPrice,
  validateModel,
  validateNewPurchaseIntent,
  validateTimeframe,
  validateTransmission,
} from "../../src/modules/purchase-intents/purchase-intents.validation.js";

const SPECIFIC_BASE = {
  intent_type: "specific_model",
  brand: "VW - VolksWagen",
  model: "T-Cross 200 TSI 1.0  Flex 12V 5p Aut.",
  transmission: "Automático",
  max_price: 95000,
  purchase_timeframe: "within_30_days",
  city_id: 7,
};

const OPEN_BASE = {
  intent_type: "open_category",
  body_type: "SUV",
  transmission: "Automático",
  max_price: 100000,
  purchase_timeframe: "within_7_days",
  city_id: 7,
};

describe("validateIntentType / validateTimeframe — allowlists fechadas", () => {
  it("aceita os dois modos previstos", () => {
    expect(validateIntentType("specific_model")).toBe(PURCHASE_INTENT_TYPE.SPECIFIC_MODEL);
    expect(validateIntentType("open_category")).toBe(PURCHASE_INTENT_TYPE.OPEN_CATEGORY);
  });

  it.each(["", "  ", "qualquer", "SPECIFIC_MODEL", null, undefined, 1])(
    "recusa intent_type %p",
    (value) => {
      expect(() => validateIntentType(value)).toThrowError(/Escolha o que você procura/);
    }
  );

  it("aceita os três prazos e recusa o resto", () => {
    expect(validateTimeframe("as_soon_as_possible")).toBe(PURCHASE_TIMEFRAME.ASAP);
    expect(validateTimeframe("within_7_days")).toBe(PURCHASE_TIMEFRAME.WITHIN_7_DAYS);
    expect(validateTimeframe("within_30_days")).toBe(PURCHASE_TIMEFRAME.WITHIN_30_DAYS);
    expect(() => validateTimeframe("amanha")).toThrowError(/Escolha quando pretende comprar/);
  });
});

describe("validateTransmission — slug canônico, nunca o rótulo", () => {
  // O valor gravado em `ads.transmission` não tem acento. Se a procura gravasse
  // "Automático", nenhum SELECT com `= 'automatico'` a encontraria.
  it.each([
    ["Automático", "automatico"],
    ["automatico", "automatico"],
    ["Automatizado", "automatico"],
    ["Semi-automático", "automatico"],
    ["Manual", "manual"],
    ["CVT", "cvt"],
  ])("%s → %s", (input, expected) => {
    expect(validateTransmission(input)).toBe(expected);
  });

  it.each(["", "  ", "—", "sei lá", null, undefined])("recusa %p", (value) => {
    expect(() => validateTransmission(value)).toThrowError(/Escolha o câmbio/);
  });
});

describe("validateBodyType — slug canônico dos anúncios", () => {
  it.each([
    ["SUV", "suv"],
    ["Sedã", "sedan"],
    ["sedan", "sedan"],
    ["Hatch", "hatch"],
    ["Picape", "picape"],
    ["Coupé", "coupe"],
    ["Perua", "wagon"],
    ["Utilitário", "suv"],
  ])("%s → %s", (input, expected) => {
    expect(validateBodyType(input)).toBe(expected);
  });

  it("recusa carroceria fora do catálogo", () => {
    expect(() => validateBodyType("Esportivo")).toThrowError(/Escolha o tipo de carroceria/);
  });
});

describe("validateBrand — tira o prefixo de grupo da FIPE", () => {
  it.each([
    ["GM - Chevrolet", "Chevrolet", "chevrolet"],
    ["VW - VolksWagen", "Volkswagen", "volkswagen"],
    ["Honda", "Honda", "honda"],
    ["Citroën", "Citroën", "citroen"],
  ])("%s → %s / %s", (input, label, slug) => {
    expect(validateBrand(input)).toEqual({ brand: label, brandSlug: slug });
  });

  it("recusa marca vazia", () => {
    expect(() => validateBrand("   ")).toThrowError(/Escolha a marca/);
  });

  it("recusa marca acima do limite", () => {
    const tooLong = "a".repeat(PURCHASE_INTENT_LIMITS.BRAND_MAX + 1);
    expect(() => validateBrand(tooLong)).toThrowError(/no máximo/);
  });
});

describe("validateModel — descrição FIPE vira modelo COMERCIAL", () => {
  // Este é o ponto do §19 da especificação: `ads.model` guarda a descrição FIPE
  // inteira, e agrupar por ela fragmenta um Onix em quatro modelos. A procura
  // precisa nascer já reduzida.
  it.each([
    ["VW - VolksWagen", "T-Cross 200 TSI 1.0  Flex 12V 5p Aut.", "T-Cross", "t-cross"],
    ["GM - Chevrolet", "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.", "Onix", "onix"],
    ["Honda", "HR-V EXL 1.8 Flexone 16V 5p Aut.", "HR-V", "hr-v"],
    ["Toyota", "Corolla Cross XRE 2.0 16V Flex Aut.", "Corolla Cross", "corolla-cross"],
  ])("%s / %s → %s", (brand, model, label, slug) => {
    expect(validateModel(model, { brand })).toEqual({ model: label, modelSlug: slug });
  });

  it("resolve modelo de cabeça numérica usando a marca (override Omoda)", () => {
    // "5 Luxury 1.5 TB FWD" quebra qualquer split(" ")[0]. Só a marca salva.
    expect(validateModel("5 Luxury 1.5 TB FWD", { brand: "Omoda" })).toEqual({
      model: "Omoda 5",
      modelSlug: "omoda-5",
    });
  });

  it("aceita um rótulo já comercial sem estragá-lo", () => {
    expect(validateModel("T-Cross", { brand: "VW - VolksWagen" })).toEqual({
      model: "T-Cross",
      modelSlug: "t-cross",
    });
  });

  it("recusa quando o modelo é indecidível — não inventa um valor", () => {
    // Cabeça numérica sem marca resolvível: `deriveCommercialModel` devolve
    // null de propósito, e isso precisa virar 400 em vez de linha torta.
    expect(() => validateModel("208 Active 1.6", { brand: null })).toThrowError(/Modelo inválido/);
    expect(() => validateModel("1.0 Flex 8V", { brand: "" })).toThrowError(/Modelo inválido/);
  });

  it("recusa modelo vazio", () => {
    expect(() => validateModel("   ", { brand: "Honda" })).toThrowError(/Escolha o modelo/);
  });
});

describe("validateMaxPrice — devolve string decimal para NUMERIC(14,2)", () => {
  it.each([
    [95000, "95000.00"],
    ["95000", "95000.00"],
    [95000.5, "95000.50"],
    ["1000", "1000.00"],
  ])("%p → %s", (input, expected) => {
    expect(validateMaxPrice(input)).toBe(expected);
  });

  it("recusa valor abaixo do piso (erro de unidade)", () => {
    // Quem digita 95 querendo 95.000 precisa ser avisado, não publicado.
    expect(() => validateMaxPrice(95)).toThrowError(/orçamento mínimo/);
  });

  it("recusa valor acima do teto", () => {
    expect(() => validateMaxPrice(PURCHASE_INTENT_LIMITS.MAX_PRICE_MAX + 1)).toThrowError(
      /acima do máximo/
    );
  });

  it.each(["", "  ", null, undefined])("recusa ausente %p", (value) => {
    expect(() => validateMaxPrice(value)).toThrowError(/Informe até quanto/);
  });

  it.each(["1e6", "95.000", "95,000", "R$ 95000", "-95000", "abc", "95000.123"])(
    "recusa formato ambíguo %p",
    (value) => {
      expect(() => validateMaxPrice(value)).toThrowError(/Valor inválido|orçamento mínimo/);
    }
  );
});

describe("parseCityId — sem fallback territorial", () => {
  it("aceita inteiro positivo em number e string", () => {
    expect(parseCityId(7)).toBe(7);
    expect(parseCityId("7")).toBe(7);
  });

  it.each([null, undefined, "", "  "])("ausência %p é 400, nunca um padrão", (value) => {
    // Nada de users.city, nada de "primeira cidade", nada de Atibaia.
    expect(() => parseCityId(value)).toThrowError(/Escolha a cidade/);
  });

  it.each(["0", "-1", "abc", "1.5", "7abc"])("recusa %p", (value) => {
    expect(() => parseCityId(value)).toThrowError(/Cidade inválida/);
  });
});

describe("parsePurchaseIntentId — id malformado é 404, não 400", () => {
  it("aceita dígitos", () => {
    expect(parsePurchaseIntentId("42")).toBe(42);
  });

  it.each(["abc", "1.5", "12abc", "-1", "0", "", null, undefined])("recusa %p com 404", (value) => {
    // 400 confirmaria o formato da chave para quem está sondando ids.
    try {
      parsePurchaseIntentId(value);
      throw new Error("deveria ter lançado");
    } catch (error) {
      expect(error.statusCode).toBe(404);
    }
  });
});

describe("parseLimit e cursor", () => {
  it("clampa o teto e cai no default para lixo", () => {
    expect(parseLimit(undefined)).toBe(PURCHASE_INTENT_PAGE.DEFAULT_LIMIT);
    expect(parseLimit("")).toBe(PURCHASE_INTENT_PAGE.DEFAULT_LIMIT);
    expect(parseLimit("abc")).toBe(PURCHASE_INTENT_PAGE.DEFAULT_LIMIT);
    expect(parseLimit("0")).toBe(PURCHASE_INTENT_PAGE.DEFAULT_LIMIT);
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit("9999")).toBe(PURCHASE_INTENT_PAGE.MAX_LIMIT);
  });

  it("faz round-trip e é opaco", () => {
    const row = { created_at: "2026-08-10T12:00:00.000Z", id: 42 };
    const cursor = encodeCursor(row);
    expect(cursor).not.toContain("2026");
    expect(decodeCursor(cursor)).toEqual({ createdAt: row.created_at, id: 42 });
  });

  it("cursor malformado volta à primeira página em vez de erro", () => {
    expect(decodeCursor("lixo")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });
});

describe("validateNewPurchaseIntent — forma completa dos dois modos", () => {
  it("specific_model: marca+modelo presentes, carroceria NULA", () => {
    expect(validateNewPurchaseIntent(SPECIFIC_BASE)).toEqual({
      intentType: "specific_model",
      cityId: 7,
      brand: "Volkswagen",
      brandSlug: "volkswagen",
      model: "T-Cross",
      modelSlug: "t-cross",
      bodyType: null,
      transmission: "automatico",
      maxPrice: "95000.00",
      purchaseTimeframe: "within_30_days",
    });
  });

  it("open_category: carroceria presente, marca/modelo NULOS", () => {
    expect(validateNewPurchaseIntent(OPEN_BASE)).toEqual({
      intentType: "open_category",
      cityId: 7,
      brand: null,
      brandSlug: null,
      model: null,
      modelSlug: null,
      bodyType: "suv",
      transmission: "automatico",
      maxPrice: "100000.00",
      purchaseTimeframe: "within_7_days",
    });
  });

  it("open_category IGNORA marca/modelo enviados junto", () => {
    // Sem isso, um cliente poderia gravar uma linha com marca E carroceria, que
    // é exatamente a forma que o CHECK do banco proíbe.
    const result = validateNewPurchaseIntent({
      ...OPEN_BASE,
      brand: "Honda",
      model: "Civic",
    });
    expect(result.brand).toBeNull();
    expect(result.model).toBeNull();
    expect(result.bodyType).toBe("suv");
  });

  it("specific_model IGNORA carroceria enviada junto", () => {
    const result = validateNewPurchaseIntent({ ...SPECIFIC_BASE, body_type: "SUV" });
    expect(result.bodyType).toBeNull();
    expect(result.model).toBe("T-Cross");
  });

  it("specific_model exige marca e modelo", () => {
    expect(() => validateNewPurchaseIntent({ ...SPECIFIC_BASE, brand: "" })).toThrowError(
      /Escolha a marca/
    );
    expect(() => validateNewPurchaseIntent({ ...SPECIFIC_BASE, model: "" })).toThrowError(
      /Escolha o modelo/
    );
  });

  it("open_category exige carroceria", () => {
    expect(() => validateNewPurchaseIntent({ ...OPEN_BASE, body_type: "" })).toThrowError(
      /Escolha o tipo de carroceria/
    );
  });

  it("câmbio é obrigatório nos DOIS modos", () => {
    expect(() => validateNewPurchaseIntent({ ...SPECIFIC_BASE, transmission: "" })).toThrowError(
      /Escolha o câmbio/
    );
    expect(() => validateNewPurchaseIntent({ ...OPEN_BASE, transmission: "" })).toThrowError(
      /Escolha o câmbio/
    );
  });

  it("cidade é obrigatória nos DOIS modos", () => {
    expect(() => validateNewPurchaseIntent({ ...SPECIFIC_BASE, city_id: null })).toThrowError(
      /Escolha a cidade/
    );
    expect(() => validateNewPurchaseIntent({ ...OPEN_BASE, city_id: null })).toThrowError(
      /Escolha a cidade/
    );
  });
});
