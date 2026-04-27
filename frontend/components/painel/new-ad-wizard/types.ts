export type SellerType = "particular" | "lojista";

export type WizardFormState = {
  sellerType: SellerType;
  step: number;
  fipeVehicleType: "carros";
  fipeBrandCode: string;
  fipeModelCode: string;
  fipeYearCode: string;
  brandLabel: string;
  modelLabel: string;
  yearModel: string;
  yearManufacture: string;
  versionLabel: string;
  color: string;
  armored: boolean;
  fuel: string;
  transmission: string;
  bodyStyle: string;
  fipeValue: string;
  mileage: string;
  price: string;
  description: string;
  /** Obrigatório para publicar: id da tabela `cities` após escolha no autocomplete */
  cityId: number | null;
  /** Nome canônico da cidade (base), preenchido junto com cityId */
  city: string;
  state: string;
  plateFinal: string;
  whatsapp: string;
  phone: string;
  acceptTerms: boolean;
  optionalIds: string[];
  conditionIds: string[];
  boostOptionId: string | null;
  /** URLs de fotos já enviadas ao storage (persistem em localStorage). */
  draftPhotoUrls: string[];
};

/**
 * Mudança de chave (mockup `pag1 anuncios.png`): wizard reduzido de 7 para
 * 5 passos. A chave de storage muda para v3 para invalidar drafts antigos
 * que carregam `step` >= 5 e quebrariam o stepper. Drafts em v2 não são
 * migrados — usuário simplesmente recomeça o wizard (perda de estado é
 * aceitável para um draft local não publicado).
 *
 * Mapeamento dos 5 passos visuais para os componentes existentes em
 * WizardSteps.tsx:
 *   0 — Veículo   → StepVehicle
 *   1 — Preço     → StepListingInfo
 *   2 — Fotos     → StepPhotos
 *   3 — Descrição → StepOptionals + StepConditions (concatenados)
 *   4 — Revisão   → StepFinalize + StepHighlight (concatenados)
 */
export const WIZARD_STORAGE_KEY = "carros-na-cidade:new-ad-wizard:v3";

export const STEP_COUNT = 5;

export const STEP_LABELS = ["Veículo", "Preço", "Fotos", "Descrição", "Revisão"] as const;
