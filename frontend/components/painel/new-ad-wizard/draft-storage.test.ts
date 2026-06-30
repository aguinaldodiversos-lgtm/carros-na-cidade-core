// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  readWizardDraft,
  writeWizardDraft,
  clearWizardDraft,
  draftBelongsTo,
} from "@/components/painel/new-ad-wizard/draft-storage";
import { WIZARD_STORAGE_KEY, type WizardFormState } from "@/components/painel/new-ad-wizard/types";

// localStorage em memória (jsdom deste projeto não expõe métodos por padrão).
const memoryStore: Record<string, string> = {};
const memoryStorage: Storage = {
  get length() {
    return Object.keys(memoryStore).length;
  },
  clear: () => {
    for (const k of Object.keys(memoryStore)) delete memoryStore[k];
  },
  getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
  key: (i: number) => Object.keys(memoryStore)[i] ?? null,
  removeItem: (k: string) => {
    delete memoryStore[k];
  },
  setItem: (k: string, v: string) => {
    memoryStore[k] = String(v);
  },
};

function buildForm(overrides: Partial<WizardFormState> = {}): WizardFormState {
  return {
    sellerType: "lojista",
    step: 2,
    fipeVehicleType: "carros",
    fipeBrandCode: "5",
    fipeModelCode: "10",
    fipeYearCode: "2024-1",
    fipeCode: "001234-5",
    fipeReferenceMonth: "maio de 2026",
    brandLabel: "BYD",
    modelLabel: "DOLPHIN",
    yearModel: "2024",
    yearManufacture: "2023",
    versionLabel: "Dolphin EV (Elétrico)",
    color: "Amarelo",
    armored: false,
    fuel: "Elétrico",
    transmission: "Automático",
    bodyStyle: "Hatch",
    fipeValue: "150000",
    mileage: "1000",
    price: "150000",
    description: "Carro de teste",
    cityId: 42,
    city: "Atibaia",
    state: "SP",
    plateFinal: "7",
    whatsapp: "11999999999",
    phone: "1133334444",
    acceptTerms: false,
    vehicleOptionKeys: [],
    boostOptionId: null,
    draftPhotoUrls: ["https://x/photo1.jpg"],
    ...overrides,
  };
}

describe("draft-storage — posse do rascunho do wizard", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: memoryStorage,
      configurable: true,
      writable: true,
    });
    memoryStorage.clear();
  });

  it("write→read faz round-trip preservando dono e form", () => {
    writeWizardDraft("userA", buildForm());
    const draft = readWizardDraft();
    expect(draft?.ownerId).toBe("userA");
    expect(draft?.form.brandLabel).toBe("BYD");
    expect(draft?.form.whatsapp).toBe("11999999999");
  });

  it("clearWizardDraft remove a chave", () => {
    writeWizardDraft("userA", buildForm());
    clearWizardDraft();
    expect(window.localStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
    expect(readWizardDraft()).toBeNull();
  });

  it("formato legado (form direto, sem wrapper) → ownerId null e não reidrata para ninguém", () => {
    // Rascunho gravado pelo formato antigo: o próprio form, sem { ownerId, form }.
    window.localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(buildForm()));
    const draft = readWizardDraft();
    expect(draft?.ownerId).toBeNull();
    expect(draft?.form.brandLabel).toBe("BYD"); // form é lido
    expect(draftBelongsTo(draft, "userA")).toBe(false); // mas não reidrata (dono desconhecido)
  });

  it("draftBelongsTo só é true quando dono == usuário confirmado", () => {
    const draft = { ownerId: "userA", form: buildForm() };
    expect(draftBelongsTo(draft, "userA")).toBe(true);
    expect(draftBelongsTo(draft, "userB")).toBe(false);
    expect(draftBelongsTo(draft, null)).toBe(false); // usuário não confirmado
    expect(draftBelongsTo({ ownerId: null, form: {} }, "userA")).toBe(false); // dono nulo
    expect(draftBelongsTo(null, "userA")).toBe(false); // sem rascunho
  });

  it("JSON corrompido não quebra — retorna null", () => {
    window.localStorage.setItem(WIZARD_STORAGE_KEY, "{nao-e-json");
    expect(readWizardDraft()).toBeNull();
  });
});
