import type { ListingCar } from "@/lib/car-data";
import { buyCars } from "@/lib/car-data";
import type { PublicAdDetail } from "@/lib/ads/ad-detail";

export type SellerDealer = {
  type: "dealer";
  name: string;
  logo: string;
  address: string;
  rating: number;
  phone?: string;
  storeSlug: string;
};

export type SellerPrivate = {
  type: "private";
  name: string;
  phone?: string;
};

export type SellerInfo = SellerDealer | SellerPrivate;

export type VehicleDetail = {
  id: string;
  slug: string;
  model: string;
  fullName: string;
  price: string;
  condition: "Novo" | "Usado";
  year: string;
  km: string;
  fuel: string;
  transmission: string;
  color: string;
  city: string;
  citySlug: string;
  adCode: string;
  isBelowFipe: boolean;
  fipePrice: string;
  images: string[];
  description: string;
  optionalItems: string[];
  safetyItems: string[];
  comfortItems: string[];
  sellerNotes: string;
  seller: SellerInfo;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function sanitizeText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function formatPrice(value?: number | string | null) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(String(value).replace(/[^\d,.-]/g, "").replace(".", "").replace(",", "."))
        : NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "R$ 0";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function toNumber(value?: number | string | null) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const normalized = Number(
    value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")
  );

  return Number.isFinite(normalized) ? normalized : null;
}

function formatYear(value?: number | string | null) {
  if (typeof value === "number" && value > 0) {
    return `${value}/${value}`;
  }

  const raw = sanitizeText(value);
  if (!raw) return "Ano não informado";
  return raw.includes("/") ? raw : `${raw}/${raw}`;
}

function formatMileage(value?: number | string | null) {
  const numeric = toNumber(value);
  if (!numeric || numeric <= 0) return "Km não informado";
  return `${numeric.toLocaleString("pt-BR")} Km`;
}

function deriveCityDisplay(city?: string | null, state?: string | null) {
  const cleanCity = sanitizeText(city, "Cidade não informada");
  const cleanState = sanitizeText(state).toUpperCase();

  if (cleanCity.includes("(") || !cleanState) {
    return cleanCity;
  }

  return `${toTitleCase(cleanCity)} (${cleanState})`;
}

function deriveCitySlug(city?: string | null, state?: string | null) {
  const cleanCity = sanitizeText(city, "sao paulo");
  const cleanState = sanitizeText(state, "sp").toLowerCase();
  return slugify(`${cleanCity} ${cleanState}`);
}

function parseImages(ad: PublicAdDetail): string[] {
  const imagesField = ad.images;

  if (Array.isArray(imagesField)) {
    const normalized = imagesField.filter(Boolean);
    if (normalized.length) return normalized;
  }

  if (typeof imagesField === "string" && imagesField.trim()) {
    try {
      const parsed = JSON.parse(imagesField);
      if (Array.isArray(parsed)) {
        const normalized = parsed.filter(Boolean);
        if (normalized.length) return normalized;
      }
    } catch {
      const normalized = imagesField
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (normalized.length) return normalized;
    }
  }

  if (ad.image_url) {
    return [ad.image_url];
  }

  return ["/images/banner1.jpg", "/images/banner2.jpg", "/images/compass.jpeg"];
}

function deriveVehicleNames(ad: PublicAdDetail) {
  const title = sanitizeText(ad.title);
  const brand = sanitizeText(ad.brand);
  const model = sanitizeText(ad.model);
  const year = sanitizeText(ad.year);

  const fullName =
    title ||
    [brand, model, year].filter(Boolean).join(" ") ||
    "Veículo";

  return {
    model: (model || title || "VEÍCULO").toUpperCase(),
    fullName,
  };
}

function buildFipeReference(price: number | null, belowFipe: boolean) {
  if (!price || price <= 0) return "Consulte";

  const estimatedFipe = belowFipe
    ? Math.round(price / 0.95)
    : Math.round(price * 1.04);

  return formatPrice(estimatedFipe);
}

export function adaptAdDetailToVehicle(ad: PublicAdDetail): VehicleDetail {
  const id = String(ad.id);
  const slug = sanitizeText(ad.slug, id);
  const images = parseImages(ad);
  const priceNumber = toNumber(ad.price);
  const belowFipe = ad.below_fipe === true;
  const { model, fullName } = deriveVehicleNames(ad);
  const city = deriveCityDisplay(ad.city, ad.state);
  const citySlug = deriveCitySlug(ad.city, ad.state);

  return {
    id,
    slug,
    model,
    fullName,
    price: formatPrice(ad.price),
    condition: "Usado",
    year: formatYear(ad.year),
    km: formatMileage(ad.mileage),
    fuel: sanitizeText(ad.fuel_type, "Não informado"),
    transmission: sanitizeText(ad.transmission, "Não informado"),
    color: "Não informado",
    city,
    citySlug,
    adCode: id,
    isBelowFipe: belowFipe,
    fipePrice: buildFipeReference(priceNumber, belowFipe),
    images,
    description:
      sanitizeText(ad.description) ||
      "Anúncio publicado no Carros na Cidade com informações oficiais do backend e contexto comercial da região.",
    optionalItems: [
      "Anúncio ativo com dados sincronizados do portal",
      "Possibilidade de simular financiamento",
      "Consulta rápida de preço e contexto regional",
    ],
    safetyItems: [
      "Valide histórico e procedência antes da compra",
      "Consulte documentação e vistoria cautelar",
      "Negociação com apoio do portal",
    ],
    comfortItems: [
      "Atendimento digital para proposta inicial",
      "Experiência de navegação otimizada para mobile",
      "CTA direto para contato e financiamento",
    ],
    sellerNotes:
      "Os dados deste anúncio foram carregados da camada pública oficial do portal. Recomendamos confirmar disponibilidade, opcionais e documentação com o anunciante.",
    seller: {
      type: "private",
      name: "Anunciante no Carros na Cidade",
    },
  };
}

function toListingCarFromSeed(seed: ListingCar, vehicle: VehicleDetail, index: number): ListingCar {
  return {
    ...seed,
    id: `${seed.id}-${vehicle.id}-${index}`,
    slug: seed.slug || `${slugify(seed.model)}-${vehicle.id}-${index}`,
    city: vehicle.city,
  };
}

export function buildCityVehicles(vehicle: VehicleDetail, limit = 6): ListingCar[] {
  return buyCars
    .slice(0, limit)
    .map((seed, index) => toListingCarFromSeed(seed, vehicle, index));
}

export function buildSimilarVehicles(vehicle: VehicleDetail, limit = 8): ListingCar[] {
  return buyCars
    .filter((seed) => slugify(seed.model) !== slugify(vehicle.model))
    .slice(0, limit)
    .map((seed, index) => toListingCarFromSeed(seed, vehicle, index + 100));
}

export function buildSellerVehicles(_vehicle: VehicleDetail, _limit = 6): ListingCar[] {
  return [];
}
