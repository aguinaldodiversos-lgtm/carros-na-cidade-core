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

export const WIZARD_STORAGE_KEY = "carros-na-cidade:new-ad-wizard:v2";

export const STEP_COUNT = 7;

export const STEP_LABELS = [
  "Dados do veículo",
  "Informações do anúncio",
  "Fotos",
  "Opcionais",
  "Condições",
  "Finalização",
  "Destaque",
] as const;
