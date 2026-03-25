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
  /** Quando preenchido, a publicação valida por id na base */
  cityId: number | null;
  city: string;
  state: string;
  plateFinal: string;
  whatsapp: string;
  phone: string;
  acceptTerms: boolean;
  optionalIds: string[];
  conditionIds: string[];
  boostOptionId: string | null;
};

export const WIZARD_STORAGE_KEY = "carros-na-cidade:new-ad-wizard:v1";

export const STEP_COUNT = 7;

export const STEP_LABELS = [
  "Dados do veículo",
  "Informações do anúncio",
  "Fotos",
  "Opcionais",
  "Condições",
  "Destaque",
  "Finalização",
] as const;
