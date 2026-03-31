import type { AdsSearchFilters } from "@/lib/search/ads-search";

export type HomeQuickChipId =
  | "below_fipe"
  | "max_30k"
  | "automatic"
  | "suv"
  | "sedan"
  | "hatch"
  | "my_city"
  | "premium";

export type HomeQuickChipDef = {
  id: HomeQuickChipId;
  label: string;
};

/** Metadados de UI — patches resolvidos em runtime (cidade padrão, etc.). */
export const HOME_QUICK_CHIPS: HomeQuickChipDef[] = [
  { id: "below_fipe", label: "Abaixo da FIPE" },
  { id: "max_30k", label: "Até R$ 30 mil" },
  { id: "automatic", label: "Automático" },
  { id: "suv", label: "SUV" },
  { id: "sedan", label: "Sedan" },
  { id: "hatch", label: "Hatch" },
  { id: "my_city", label: "Na sua cidade" },
  { id: "premium", label: "Loja Premium" },
];

export function homeQuickChipToPatch(
  id: HomeQuickChipId,
  defaultCitySlug: string
): Partial<AdsSearchFilters> {
  switch (id) {
    case "below_fipe":
      return { below_fipe: true };
    case "max_30k":
      return { max_price: 30000 };
    case "automatic":
      return { transmission: "Automático" };
    case "suv":
      return { body_type: "SUV" };
    case "sedan":
      return { body_type: "Sedan" };
    case "hatch":
      return { body_type: "Hatch" };
    case "my_city":
      return { city_slug: defaultCitySlug };
    case "premium":
      return { highlight_only: true };
    default:
      return {};
  }
}

export function mergeSelectedChipPatches(
  selected: ReadonlySet<HomeQuickChipId>,
  defaultCitySlug: string
): Partial<AdsSearchFilters> {
  const out: Partial<AdsSearchFilters> = {};
  for (const id of selected) {
    Object.assign(out, homeQuickChipToPatch(id, defaultCitySlug));
  }
  return out;
}
