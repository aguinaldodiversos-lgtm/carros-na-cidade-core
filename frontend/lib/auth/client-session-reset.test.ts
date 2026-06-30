// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { clearClientAuthArtifacts } from "@/lib/auth/client-session-reset";

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
import {
  writeWizardDraft,
  readWizardDraft,
  draftBelongsTo,
} from "@/components/painel/new-ad-wizard/draft-storage";
import { WIZARD_STORAGE_KEY, type WizardFormState } from "@/components/painel/new-ad-wizard/types";

/**
 * Trava o bug de vazamento de rascunho entre contas no mesmo navegador:
 *   1. Desalinhamento de chave: o reset de auth limpava ":v1" enquanto o
 *      wizard gravava em ":v3" — o rascunho sobrevivia ao logout/login.
 *   2. Defesa em profundidade: mesmo sem limpeza, o rascunho de um usuário
 *      nunca pode ser reidratado para outro (posse por ownerId).
 */

function buildForm(overrides: Partial<WizardFormState> = {}): WizardFormState {
  return {
    sellerType: "lojista",
    step: 0,
    fipeVehicleType: "carros",
    fipeBrandCode: "",
    fipeModelCode: "",
    fipeYearCode: "",
    fipeCode: "",
    fipeReferenceMonth: "",
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
    fipeValue: "",
    mileage: "1000",
    price: "150000",
    description: "",
    cityId: 1,
    city: "Atibaia",
    state: "SP",
    plateFinal: "7",
    whatsapp: "11999999999",
    phone: "1133334444",
    acceptTerms: false,
    vehicleOptionKeys: [],
    boostOptionId: null,
    draftPhotoUrls: [],
    ...overrides,
  };
}

describe("client-session-reset — limpeza do rascunho do wizard", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: memoryStorage,
      configurable: true,
      writable: true,
    });
    memoryStorage.clear();
  });

  it("Layer 1: remove o rascunho REAL (:v3), não a chave morta :v1", () => {
    writeWizardDraft("userA", buildForm());
    expect(window.localStorage.getItem(WIZARD_STORAGE_KEY)).not.toBeNull();

    clearClientAuthArtifacts();

    expect(window.localStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
  });

  it("regressão A→logout→B: A preenche (whatsapp/phone), logout limpa, B abre o wizard VAZIO", () => {
    // Conta A preenche o wizard — persistido com dono A (inclui PII de contato).
    writeWizardDraft("userA", buildForm({ whatsapp: "11999999999", phone: "1133334444" }));

    // Logout/login dispara clearClientAuthArtifacts (mesmo caminho do app).
    clearClientAuthArtifacts();

    // Conta B abre o wizard: não há rascunho algum para reidratar.
    const draftForB = readWizardDraft();
    expect(draftForB).toBeNull();
    expect(draftBelongsTo(draftForB, "userB")).toBe(false);
  });

  it("defesa em profundidade: mesmo SEM a limpeza, o rascunho de A não reidrata para B", () => {
    writeWizardDraft("userA", buildForm({ whatsapp: "11999999999" }));

    // Simula a limpeza falhando (não chamamos clearClientAuthArtifacts).
    const draft = readWizardDraft();

    expect(draft?.ownerId).toBe("userA");
    expect(draft?.form.whatsapp).toBe("11999999999");
    expect(draftBelongsTo(draft, "userB")).toBe(false); // B NUNCA reidrata o de A
    expect(draftBelongsTo(draft, "userA")).toBe(true); // A reidrata o próprio
  });
});
