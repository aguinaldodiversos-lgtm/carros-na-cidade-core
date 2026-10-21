import type { SearchParams } from "@/lib/buy/territory-variant";

/**
 * A intenção "carros baratos em [cidade]" pertence à própria URL.
 * Query params apenas refinam marca/ano/preço, nunca retiram abaixo-FIPE
 * nem ampliam o território para cidades vizinhas (raio 0 = cidade exata).
 */
export function enforceBelowFipeCatalogFilters(searchParams: SearchParams): SearchParams {
  return {
    ...searchParams,
    below_fipe: "true",
    raio: "0",
  };
}
