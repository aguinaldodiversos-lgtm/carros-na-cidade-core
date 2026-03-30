import type { CityRef } from "@/lib/city/city-types";
import { buildCityLabel } from "@/lib/city/city-types";
import { DEFAULT_PUBLIC_CITY_LABEL, DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

/** Cidade padrão garantida — nunca deixa o sistema sem território válido para API. */
export const DEFAULT_CITY: CityRef = {
  slug: DEFAULT_PUBLIC_CITY_SLUG,
  name: DEFAULT_PUBLIC_CITY_LABEL,
  state: "SP",
  label: buildCityLabel(DEFAULT_PUBLIC_CITY_LABEL, "SP"),
};
