import type { AdsSearchFilters } from "@/lib/search/ads-search";

/** Resultado do parser local — evoluir para pipeline com IA sem mudar a interface pública. */
export type SearchIntentParseResult = {
  filters: Partial<AdsSearchFilters>;
  /** Trechos não estruturados — viram `q` na URL ao enviar para /comprar. */
  remainderText: string;
  /** O usuário mencionou moto no texto (reforça `q` com “moto”). */
  detectedMotoInText: boolean;
};

export type VehicleSearchKind = "car" | "motorcycle";

/** Entrada futura para provedor externo (IA) — manter opcional. */
export type SearchIntentProviderContext = {
  defaultCitySlug: string;
  defaultCityLabel: string;
  featuredCities: Array<{ name: string; slug: string }>;
};
