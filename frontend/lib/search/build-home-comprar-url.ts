import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { buildSearchQueryString } from "@/lib/search/ads-search-url";
import { getCanonicalCityPath } from "@/lib/seo/canonical-city-path";
import type { SearchIntentParseResult, VehicleSearchKind } from "@/lib/search/search-intent-types";

/**
 * Monta a URL de destino da busca da home a partir do texto livre, chips e
 * tipo de veículo. Chips aplicados primeiro; filtros do parser sobrescrevem
 * (texto mais específico).
 *
 * O destino é a CANÔNICA da cidade (`/carros-em/[slug]?<filtros>`), não
 * `/comprar?city_slug=…`. A busca da home é o caminho mais usado do site;
 * mandá-la para uma URL que só redireciona custava um salto em toda busca.
 *
 * Sem cidade utilizável, cai na vitrine nacional — nunca numa cidade escolhida
 * por nós.
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

  merged.city_slug = parsed.filters.city_slug ?? chipFilters.city_slug ?? defaultCitySlug;

  const qBits: string[] = [];
  if (parsed.remainderText?.trim()) {
    qBits.push(parsed.remainderText.trim());
  }

  const needMoto = vehicleType === "motorcycle" || parsed.detectedMotoInText;
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

  const canonicalCity = getCanonicalCityPath(merged.city_slug);
  if (!canonicalCity) {
    // Sem cidade válida não há catálogo territorial a abrir. A vitrine
    // nacional é a resposta honesta — escolher uma cidade aqui serviria o
    // estoque dela para quem não pediu.
    return "/comprar";
  }

  // Território sai da query: ele já está no path, e mantê-lo nos dois lugares
  // recriaria duas grafias da mesma URL.
  const territoryless: AdsSearchFilters = { ...merged };
  delete territoryless.city_slug;
  delete territoryless.city_id;
  delete territoryless.city;
  delete territoryless.state;

  const qs = buildSearchQueryString(territoryless);
  return qs ? `${canonicalCity}?${qs}` : canonicalCity;
}
