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
  { brand: "Toyota", total: 1520 },
  { brand: "Chevrolet", total: 1320 },
  { brand: "Honda", total: 935 },
  { brand: "Volkswagen", total: 1210 },
  { brand: "Jeep", total: 720 },
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

export function normalizeCatalogItem(item: Partial<CatalogItem>, city: BuyCityContext): CatalogItem {
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

function buildFallbackCatalog(city: BuyCityContext): CatalogItem[] {
  const seed: Array<Partial<CatalogItem>> = [
    {
      id: 900001,
      slug: "byd-yuan-plus-2023",
      title: "2023 BYD Yuan Plus",
      brand: "BYD",
      model: "Yuan Plus",
      fuel_type: "Elétrico",
      transmission: "Automático",
      mileage: 5000,
      city: city.name,
      state: city.state,
      price: 235990,
      image_url: "/images/vehicle-placeholder.svg",
      highlight_until: new Date().toISOString(),
      catalogWeight: 4,
    },
    {
      id: 900002,
      slug: "nissan-kicks-2022",
      title: "2022 Nissan Kicks",
      brand: "Nissan",
      model: "Kicks",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 18000,
      city: city.name,
      state: city.state,
      price: 98900,
      image_url: "/images/vehicle-placeholder.svg",
      below_fipe: true,
      highlight_until: new Date().toISOString(),
      catalogWeight: 4,
    },
    {
      id: 900003,
      slug: "volkswagen-taos-highline-2022",
      title: "Volkswagen Taos Highline",
      brand: "Volkswagen",
      model: "Taos",
      fuel_type: "Gasolina",
      transmission: "Automático",
      mileage: 26080,
      city: city.name,
      state: city.state,
      price: 159900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 3,
      dealership_name: "Premium Motors",
    },
    {
      id: 900004,
      slug: "jeep-renegade-longitude-2022",
      title: "2022 Jeep Renegade",
      brand: "Jeep",
      model: "Renegade",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 28000,
      city: city.name,
      state: city.state,
      price: 159900,
      image_url: "/images/vehicle-placeholder.svg",
      dealership_name: "Prime Autos",
      catalogWeight: 3,
      below_fipe: true,
    },
    {
      id: 900005,
      slug: "renegade-longitude-t270-2021",
      title: "Renegade Longitude T270",
      brand: "Jeep",
      model: "Renegade",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 6000,
      city: city.name,
      state: city.state,
      price: 115900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 3,
      dealership_name: "Revenda Premium",
    },
    {
      id: 900006,
      slug: "jeep-renegade-2022",
      title: "2022 Renegade",
      brand: "Jeep",
      model: "Renegade",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 150000,
      city: city.name,
      state: city.state,
      price: 115900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 2,
      dealership_name: "Auto Center",
    },
    {
      id: 900007,
      slug: "honda-civic-2021",
      title: "2021 Honda Civic",
      brand: "Honda",
      model: "Civic",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 22000,
      city: city.name,
      state: city.state,
      price: 125900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 2,
      dealership_name: "Loja Local",
    },
    {
      id: 900008,
      slug: "chevrolet-onix-2021",
      title: "2021 Chevrolet Onix",
      brand: "Chevrolet",
      model: "Onix",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 50000,
      city: city.name,
      state: city.state,
      price: 79900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 1,
      seller_type: "private",
    },
  ];

  return seed.map((item) => normalizeCatalogItem(item, city));
}

export function toSafeCatalogItems(
  value: AdsSearchResponse["data"] | undefined,
  city: BuyCityContext
): CatalogItem[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item) => normalizeCatalogItem(item, city));
  }

  return buildFallbackCatalog(city);
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
    newest: Math.max(items.length, 1520),
    cheaper: Math.max(items.filter((item) => parseNumber(item.price) <= 100000).length, 130),
    lessMileage: Math.max(
      items.filter((item) => parseNumber(item.mileage) > 0 && parseNumber(item.mileage) <= 40000)
        .length,
      935
    ),
  };
}
