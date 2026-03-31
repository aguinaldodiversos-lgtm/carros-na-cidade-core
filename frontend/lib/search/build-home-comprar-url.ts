import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { buildSearchQueryString } from "@/lib/search/ads-search-url";
import type { SearchIntentParseResult, VehicleSearchKind } from "@/lib/search/search-intent-types";

/**
 * Monta a URL de /comprar a partir do texto livre, chips e tipo de veículo.
 * Chips aplicados primeiro; filtros do parser sobrescrevem (texto mais específico).
 */
export function buildComprarUrlFromHomeSearch(options: {
  defaultCitySlug: string;
  vehicleType: VehicleSearchKind;
  parsed: SearchIntentParseResult;
  chipFilters: Partial<AdsSearchFilters>;
}): string {
  const { defaultCitySlug, vehicleType, parsed, chipFilters } = options;

  const merged: AdsSearchFilters = {
    sort: "recent",
    ...chipFilters,
    ...parsed.filters,
  };

  merged.city_slug =
    parsed.filters.city_slug ?? chipFilters.city_slug ?? defaultCitySlug;

  const qBits: string[] = [];
  if (parsed.remainderText?.trim()) {
    qBits.push(parsed.remainderText.trim());
  }

  const needMoto =
    vehicleType === "motorcycle" || parsed.detectedMotoInText;
  if (needMoto) {
    const blob = qBits.join(" ").toLowerCase();
    if (!/\bmoto\b/.test(blob)) {
      qBits.push("moto");
    }
  }

  const q = qBits.join(" ").replace(/\s+/g, " ").trim();
  if (q) {
    merged.q = merged.q ? `${merged.q} ${q}`.trim() : q;
  }

  const qs = buildSearchQueryString(merged);
  return qs ? `/comprar?${qs}` : "/comprar";
}
