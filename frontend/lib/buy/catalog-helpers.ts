/**
 * Normalização, ordenação e facetas do catálogo da página Comprar.
 * Mantém a lógica de listagem desacoplada dos componentes de UI.
 */

import type { CatalogItem } from "@/components/buy/CatalogVehicleCard";
import type { AdsSearchResponse } from "@/lib/search/ads-search";

export type BuyCityContext = {
  name: string;
  state: string;
  slug: string;
  label: string;
};

export type BrandFacet = {
  brand: string;
  total: number;
};

export type ModelFacet = {
  brand?: string;
  model: string;
  total: number;
};

export const DEFAULT_BRAND_OPTIONS = [
  { label: "Selecionar marca", value: "" },
  { label: "Toyota", value: "Toyota" },
  { label: "Chevrolet", value: "Chevrolet" },
  { label: "Honda", value: "Honda" },
  { label: "Volkswagen", value: "Volkswagen" },
  { label: "Jeep", value: "Jeep" },
];

export const DEFAULT_MODEL_OPTIONS = [
  { label: "Selecionar modelo", value: "" },
  { label: "Corolla", value: "Corolla" },
  { label: "Civic", value: "Civic" },
  { label: "Onix", value: "Onix" },
  { label: "Compass", value: "Compass" },
  { label: "Renegade", value: "Renegade" },
];

export const DEFAULT_POPULAR_BRANDS: BrandFacet[] = [
  { brand: "Toyota", total: 0 },
  { brand: "Chevrolet", total: 0 },
  { brand: "Honda", total: 0 },
  { brand: "Volkswagen", total: 0 },
  { brand: "Jeep", total: 0 },
];

export function parseNumber(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sanitizeText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function parseDate(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function formatTotal(total?: number) {
  return new Intl.NumberFormat("pt-BR").format(total || 0);
}

export function normalizeCatalogItem(
  item: Partial<CatalogItem>,
  city: BuyCityContext
): CatalogItem {
  const validImages = Array.isArray(item.images)
    ? item.images.filter(
        (image): image is string => typeof image === "string" && image.trim().length > 0
      )
    : undefined;

  const parsedYear =
    typeof item.year === "number"
      ? item.year
      : item.year !== undefined && item.year !== null && item.year !== ""
        ? parseNumber(item.year)
        : undefined;

  const parsedMileage =
    typeof item.mileage === "number"
      ? item.mileage
      : item.mileage !== undefined && item.mileage !== null && item.mileage !== ""
        ? parseNumber(item.mileage)
        : undefined;

  const parsedPrice =
    typeof item.price === "number"
      ? item.price
      : item.price !== undefined && item.price !== null && item.price !== ""
        ? parseNumber(item.price)
        : undefined;

  return {
    id: Number(item.id || 0),
    slug: sanitizeText(item.slug) || undefined,
    title: sanitizeText(item.title) || undefined,
    brand: sanitizeText(item.brand) || undefined,
    model: sanitizeText(item.model) || undefined,
    version: sanitizeText(item.version) || undefined,
    year: parsedYear,
    year_model: sanitizeText(item.year_model) || undefined,
    mileage: parsedMileage,
    transmission: sanitizeText(item.transmission) || undefined,
    fuel_type: sanitizeText(item.fuel_type) || undefined,
    city: sanitizeText(item.city) || city.name,
    state: sanitizeText(item.state) || city.state,
    price: parsedPrice,
    image_url: sanitizeText(item.image_url) || undefined,
    image: sanitizeText(item.image) || undefined,
    cover_image: sanitizeText(item.cover_image) || undefined,
    storage_key: sanitizeText(item.storage_key) || undefined,
    images: validImages && validImages.length > 0 ? validImages : undefined,
    below_fipe: item.below_fipe === true,
    highlight_until: sanitizeText(item.highlight_until) || undefined,
    plan: sanitizeText(item.plan) || undefined,
    seller_type: sanitizeText(item.seller_type) || undefined,
    dealer_name: sanitizeText(item.dealer_name) || undefined,
    dealership_name: sanitizeText(item.dealership_name) || undefined,
    dealership_id: typeof item.dealership_id === "number" ? item.dealership_id : undefined,
    created_at: sanitizeText(item.created_at) || undefined,
    catalogWeight: item.catalogWeight,
  };
}

export function toSafeCatalogItems(
  value: AdsSearchResponse["data"] | undefined,
  city: BuyCityContext
): CatalogItem[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item) => normalizeCatalogItem(item, city));
  }

  return [];
}

export function toSafeBrandFacets(value: unknown): BrandFacet[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const obj = (item || {}) as Partial<BrandFacet>;
      return {
        brand: sanitizeText(obj.brand),
        total: Number(obj.total || 0),
      };
    })
    .filter((item) => item.brand);
}

export function toSafeModelFacets(value: unknown): ModelFacet[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const obj = (item || {}) as Partial<ModelFacet>;
      return {
        brand: sanitizeText(obj.brand) || undefined,
        model: sanitizeText(obj.model),
        total: Number(obj.total || 0),
      };
    })
    .filter((item) => item.model);
}

export function inferWeight(item: CatalogItem): 1 | 2 | 3 | 4 {
  if (item.catalogWeight) return item.catalogWeight;

  if (item.highlight_until) return 4;

  const plan = String(item.plan || "").toLowerCase();
  if (
    ["premium", "pro", "complete", "enterprise", "plus", "master"].some((signal) =>
      plan.includes(signal)
    )
  ) {
    return 3;
  }

  const isDealer = Boolean(
    item.dealership_id ||
      item.dealership_name ||
      item.dealer_name ||
      item.seller_type === "dealer" ||
      item.seller_type === "dealership"
  );

  if (isDealer) return 2;
  return 1;
}

/**
 * Ordenação client-side do catálogo (legado). A página /comprar usa a ordem retornada pela API
 * (`buildSortClause` no backend) para evitar divergência com paginação e com o sort selecionado.
 */
export function sortCatalogItems(items: CatalogItem[], sort?: string) {
  const mode = sort || "relevance";
  if (mode === "relevance" || mode === "highlight") {
    return items;
  }

  if (mode === "recent") {
    return [...items].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  }

  if (mode === "year_desc") {
    return [...items].sort((a, b) => parseNumber(b.year) - parseNumber(a.year));
  }

  if (mode === "price_asc") {
    return [...items].sort((a, b) => parseNumber(a.price) - parseNumber(b.price));
  }

  if (mode === "price_desc") {
    return [...items].sort((a, b) => parseNumber(b.price) - parseNumber(a.price));
  }

  if (mode === "mileage_asc") {
    return [...items].sort((a, b) => parseNumber(a.mileage) - parseNumber(b.mileage));
  }

  return [...items].sort((a, b) => {
    const weightA = inferWeight(a);
    const weightB = inferWeight(b);

    if (weightA !== weightB) return weightB - weightA;

    const belowFipeA = a.below_fipe ? 1 : 0;
    const belowFipeB = b.below_fipe ? 1 : 0;
    if (belowFipeA !== belowFipeB) return belowFipeB - belowFipeA;

    const dateA = parseDate(a.created_at);
    const dateB = parseDate(b.created_at);
    if (dateA !== dateB) return dateB - dateA;

    const priceA = parseNumber(a.price);
    const priceB = parseNumber(b.price);
    return priceB - priceA;
  });
}

export function buildCatalogStats(items: CatalogItem[]) {
  return {
    newest: items.length,
    cheaper: items.filter((item) => parseNumber(item.price) <= 100000).length,
    lessMileage: items.filter(
      (item) => parseNumber(item.mileage) > 0 && parseNumber(item.mileage) <= 40000
    ).length,
  };
}
