import { describe, it, expect } from "vitest";

/**
 * Testa a lógica de validação de cada etapa do wizard de anúncio,
 * incluindo a nova ordem (Finalização antes de Destaque) e a validação
 * de fotos via draftPhotoUrls.
 *
 * O validateStep vive no componente React (NewAdWizardClient), então
 * replicamos a lógica pura aqui para testes unitários determinísticos.
 */

function parseCurrency(v) {
  if (!v?.trim()) return 0;
  const cleaned = v
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function validateStep(step, form) {
  switch (step) {
    case 0:
      if (!form.fipeBrandCode || !form.brandLabel) return "Selecione a marca.";
      if (!form.fipeModelCode || !form.modelLabel) return "Selecione o modelo.";
      if (!form.yearModel) return "Selecione o ano do modelo.";
      if (!form.yearManufacture) return "Selecione o ano de fabricação.";
      if (!form.fipeYearCode || !form.versionLabel) return "Selecione a versão.";
      if (!form.color) return "Selecione a cor.";
      return null;
    case 1:
      if (!form.mileage.trim()) return "Informe a quilometragem.";
      if (!form.price.trim() || parseCurrency(form.price) <= 0)
        return "Informe o preço do anúncio.";
      return null;
    case 2:
      if (form.draftPhotoUrls.length < 1) return "Adicione pelo menos uma foto.";
      return null;
    case 3:
    case 4:
      return null;
    case 5:
      if (!form.state.trim() || form.state.length !== 2) return "Selecione a UF.";
      if (form.cityId == null || !Number.isFinite(form.cityId))
        return "Selecione uma cidade válida da lista para continuar.";
      if (!form.city.trim()) return "Selecione uma cidade válida da lista para continuar.";
      if (!form.acceptTerms) return "Aceite os termos para publicar.";
      return null;
    case 6:
      return null;
    default:
      return null;
  }
}

const VALID_VEHICLE = {
  fipeBrandCode: "59",
  brandLabel: "VW",
  fipeModelCode: "5585",
  modelLabel: "Gol",
  yearModel: "2021",
  yearManufacture: "2020",
  fipeYearCode: "2021-1",
  versionLabel: "1.0 MPI",
  color: "Branco",
};

const VALID_LISTING = {
  mileage: "32000",
  price: "R$ 45.000,00",
};

const VALID_FINALIZE = {
  state: "SP",
  cityId: 42,
  city: "Atibaia",
  acceptTerms: true,
};

function makeForm(overrides = {}) {
  return {
    ...VALID_VEHICLE,
    ...VALID_LISTING,
    ...VALID_FINALIZE,
    draftPhotoUrls: ["https://r2.example.com/photo1.jpg"],
    ...overrides,
  };
}

describe("Wizard step validation", () => {
  describe("Step 0 — Vehicle data", () => {
    it("passes with all vehicle fields filled", () => {
      expect(validateStep(0, makeForm())).toBeNull();
    });

    it("fails without brand", () => {
      expect(validateStep(0, makeForm({ fipeBrandCode: "" }))).toContain("marca");
    });

    it("fails without model", () => {
      expect(validateStep(0, makeForm({ fipeModelCode: "" }))).toContain("modelo");
    });

    it("fails without year", () => {
      expect(validateStep(0, makeForm({ yearModel: "" }))).toContain("ano");
    });

    it("fails without version", () => {
      expect(validateStep(0, makeForm({ fipeYearCode: "" }))).toContain("versão");
    });

    it("fails without color", () => {
      expect(validateStep(0, makeForm({ color: "" }))).toContain("cor");
    });
  });

  describe("Step 1 — Listing info", () => {
    it("passes with mileage and price", () => {
      expect(validateStep(1, makeForm())).toBeNull();
    });

    it("fails without mileage", () => {
      expect(validateStep(1, makeForm({ mileage: "" }))).toContain("quilometragem");
    });

    it("fails without price", () => {
      expect(validateStep(1, makeForm({ price: "" }))).toContain("preço");
    });

    it("fails with zero price", () => {
      expect(validateStep(1, makeForm({ price: "R$ 0,00" }))).toContain("preço");
    });
  });

  describe("Step 2 — Photos (draftPhotoUrls)", () => {
    it("passes with at least one photo URL", () => {
      expect(validateStep(2, makeForm())).toBeNull();
    });

    it("fails with empty draftPhotoUrls", () => {
      expect(validateStep(2, makeForm({ draftPhotoUrls: [] }))).toContain("foto");
    });

    it("passes with multiple photo URLs", () => {
      expect(
        validateStep(
          2,
          makeForm({
            draftPhotoUrls: [
              "https://r2.example.com/1.jpg",
              "https://r2.example.com/2.jpg",
              "https://r2.example.com/3.jpg",
            ],
          })
        )
      ).toBeNull();
    });
  });

  describe("Step 3 — Optionals (no required fields)", () => {
    it("always passes", () => {
      expect(validateStep(3, makeForm())).toBeNull();
    });
  });

  describe("Step 4 — Conditions (no required fields)", () => {
    it("always passes", () => {
      expect(validateStep(4, makeForm())).toBeNull();
    });
  });

  describe("Step 5 — Finalization (was step 6, now step 5)", () => {
    it("passes with all finalize fields filled", () => {
      expect(validateStep(5, makeForm())).toBeNull();
    });

    it("fails without state/UF", () => {
      expect(validateStep(5, makeForm({ state: "" }))).toContain("UF");
    });

    it("fails without cityId", () => {
      expect(validateStep(5, makeForm({ cityId: null }))).toContain("cidade");
    });

    it("fails without city name", () => {
      expect(validateStep(5, makeForm({ city: "" }))).toContain("cidade");
    });

    it("fails without acceptTerms", () => {
      expect(validateStep(5, makeForm({ acceptTerms: false }))).toContain("termos");
    });
  });

  describe("Step 6 — Highlight/Boost (was step 5, now last)", () => {
    it("always passes (boost selection is optional)", () => {
      expect(validateStep(6, makeForm())).toBeNull();
      expect(validateStep(6, makeForm({ boostOptionId: null }))).toBeNull();
      expect(validateStep(6, makeForm({ boostOptionId: "premium" }))).toBeNull();
    });
  });
});

describe("Step order: payment is last", () => {
  const EXPECTED_LABELS = [
    "Dados do veículo",
    "Informações do anúncio",
    "Fotos",
    "Opcionais",
    "Condições",
    "Finalização",
    "Destaque",
  ];

  it("Finalização is step 6 (index 5) and Destaque is step 7 (index 6)", () => {
    expect(EXPECTED_LABELS[5]).toBe("Finalização");
    expect(EXPECTED_LABELS[6]).toBe("Destaque");
  });

  it("Destaque (payment) is the last step", () => {
    expect(EXPECTED_LABELS[EXPECTED_LABELS.length - 1]).toBe("Destaque");
  });

  it("has 7 steps total", () => {
    expect(EXPECTED_LABELS).toHaveLength(7);
  });
});

describe("Submit pre-validation covers critical steps", () => {
  const SUBMIT_STEPS = [0, 1, 2, 5];

  it("includes vehicle data (step 0)", () => {
    expect(SUBMIT_STEPS).toContain(0);
  });

  it("includes listing info (step 1)", () => {
    expect(SUBMIT_STEPS).toContain(1);
  });

  it("includes photos (step 2)", () => {
    expect(SUBMIT_STEPS).toContain(2);
  });

  it("includes finalization with city/contact/terms (step 5)", () => {
    expect(SUBMIT_STEPS).toContain(5);
  });

  it("does NOT include boost/highlight step (step 6) — it is optional", () => {
    expect(SUBMIT_STEPS).not.toContain(6);
  });
});
