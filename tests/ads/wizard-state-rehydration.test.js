import { describe, it, expect } from "vitest";

/**
 * Backward-compat do localStorage do wizard.
 *
 * Drafts criados antes desta rodada NÃO têm `fipeCode` nem
 * `fipeReferenceMonth`. A rehydration em `NewAdWizardClient.tsx` faz:
 *
 *     setForm({ ...INITIAL_FORM, ...parsed })
 *
 * Esse teste valida o invariante: spread aplicado a um draft antigo
 * preserva os campos legados E preenche os novos com strings vazias
 * (defaults seguros). Sem isso, drafts antigos quebrariam o submit
 * porque `form.fipeCode` seria `undefined` e o FormData converteria
 * para "undefined".
 *
 * Mantemos o teste no backend runner (não exige jsdom) porque o
 * comportamento crítico é de objeto puro — não de DOM.
 */

const INITIAL_FORM_DEFAULTS = {
  sellerType: "particular",
  step: 0,
  fipeVehicleType: "carros",
  fipeBrandCode: "",
  fipeModelCode: "",
  fipeYearCode: "",
  fipeCode: "",
  fipeReferenceMonth: "",
  brandLabel: "",
  modelLabel: "",
  yearModel: "",
  yearManufacture: "",
  versionLabel: "",
  color: "",
  armored: false,
  fuel: "Flex",
  transmission: "Automático",
  bodyStyle: "Sedã",
  fipeValue: "",
  mileage: "",
  price: "",
  description: "",
  cityId: null,
  city: "",
  state: "",
  plateFinal: "",
  whatsapp: "",
  phone: "",
  acceptTerms: false,
  optionalIds: [],
  conditionIds: [],
  boostOptionId: null,
  draftPhotoUrls: [],
};

function rehydrate(parsed) {
  // Espelha o que NewAdWizardClient.tsx faz na hidratação.
  return { ...INITIAL_FORM_DEFAULTS, ...parsed };
}

describe("Wizard rehydration — drafts antigos sem códigos FIPE", () => {
  it("draft pré-rodada (sem fipeCode/fipeReferenceMonth) recebe defaults vazios", () => {
    const oldDraft = {
      sellerType: "lojista",
      step: 2,
      fipeBrandCode: "23",
      fipeModelCode: "5585",
      fipeYearCode: "2018-1",
      brandLabel: "Honda",
      modelLabel: "Civic",
      yearModel: "2018",
      yearManufacture: "2017",
      versionLabel: "LX",
      fipeValue: "R$ 85.000,00",
      mileage: "50000",
      price: "R$ 80.000,00",
      city: "Atibaia",
      state: "SP",
      cityId: 42,
      acceptTerms: true,
      optionalIds: [],
      conditionIds: [],
      draftPhotoUrls: ["https://r2.example/1.webp"],
    };
    const hydrated = rehydrate(oldDraft);

    // Campos novos com defaults seguros:
    expect(hydrated.fipeCode).toBe("");
    expect(hydrated.fipeReferenceMonth).toBe("");

    // Campos legados preservados:
    expect(hydrated.fipeBrandCode).toBe("23");
    expect(hydrated.brandLabel).toBe("Honda");
    expect(hydrated.draftPhotoUrls).toEqual(["https://r2.example/1.webp"]);
    expect(hydrated.acceptTerms).toBe(true);
  });

  it("draft pós-rodada (com códigos completos) preserva todos os valores", () => {
    const newDraft = {
      ...INITIAL_FORM_DEFAULTS,
      fipeBrandCode: "23",
      fipeModelCode: "5585",
      fipeYearCode: "2018-1",
      fipeCode: "001234-5",
      fipeReferenceMonth: "maio de 2026",
    };
    const hydrated = rehydrate(newDraft);
    expect(hydrated.fipeCode).toBe("001234-5");
    expect(hydrated.fipeReferenceMonth).toBe("maio de 2026");
  });

  it("localStorage corrompido / vazio cai em INITIAL_FORM puro", () => {
    expect(rehydrate({})).toEqual(INITIAL_FORM_DEFAULTS);
    expect(rehydrate(undefined)).toEqual(INITIAL_FORM_DEFAULTS);
  });
});
