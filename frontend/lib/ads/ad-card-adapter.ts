import type { AdItem } from "@/lib/search/ads-search";
import type { ListingCar } from "@/lib/car-data";

type LegacyCarCardInput = {
  id?: string | number;
  slug?: string;
  title?: string;
  image?: string | null;
  city?: string;
  state?: string;
  sponsored?: boolean;
  discount?: number | string;
  price?: string | number | null;
};

const FALLBACK_IMAGE = "/images/hero.jpeg";

function toNumber(value?: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return undefined;

  const parsed = Number(
    String(value)
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  );

  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeText(value?: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createStableId(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash || 1;
}

function parseCityState(value?: string) {
  const normalized = sanitizeText(value);

  if (!normalized) {
    return { city: undefined, state: undefined };
  }

  const parenthesisMatch = normalized.match(/^(.*)\s+\(([A-Za-z]{2})\)$/);
  if (parenthesisMatch) {
    return {
      city: sanitizeText(parenthesisMatch[1]),
      state: sanitizeText(parenthesisMatch[2])?.toUpperCase(),
    };
  }

  const dashParts = normalized
    .split(" - ")
    .map((item) => item.trim())
    .filter(Boolean);

  if (dashParts.length >= 2) {
    return {
      city: sanitizeText(dashParts[0]),
      state: sanitizeText(dashParts[1])?.toUpperCase(),
    };
  }

  return { city: normalized, state: undefined };
}

function extractYear(yearModel?: string) {
  const normalized = sanitizeText(yearModel);
  if (!normalized) return undefined;

  const match = normalized.match(/\d{4}/);
  if (!match) return undefined;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractMileage(km?: string) {
  const normalized = sanitizeText(km);
  if (!normalized) return undefined;

  const numeric = normalized.replace(/\D/g, "");
  if (!numeric) return undefined;

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeImage(image?: string | null) {
  const normalized = sanitizeText(image);
  return normalized || FALLBACK_IMAGE;
}

function inferBrand(model?: string, explicitBrand?: string) {
  const safeBrand = sanitizeText(explicitBrand);
  if (safeBrand) return safeBrand;

  const safeModel = sanitizeText(model);
  if (!safeModel) return undefined;

  const firstWord = safeModel.split(" ").filter(Boolean)[0];
  return firstWord || undefined;
}

function buildTitle(parts: Array<string | undefined>) {
  const title = parts.filter(Boolean).join(" ").trim();
  return title || "Veículo";
}

function resolveBadgeFlags(value?: string) {
  const normalized = sanitizeText(value)?.toLowerCase();

  return {
    belowFipe:
      normalized === "fipe" ||
      normalized?.includes("abaixo da fipe") ||
      false,
    highlight:
      normalized === "destaque" ||
      normalized?.includes("destaque") ||
      false,
  };
}

export function listingCarToAdItem(vehicle: ListingCar): AdItem {
  const location = parseCityState(vehicle.city);
  const brand = inferBrand(vehicle.model);
  const { belowFipe, highlight } = resolveBadgeFlags(
    sanitizeText((vehicle as ListingCar & { badge?: string }).badge)
  );

  const title = buildTitle([
    sanitizeText(vehicle.model),
    sanitizeText(vehicle.version),
  ]);

  const rawId =
    typeof vehicle.id === "number" && Number.isFinite(vehicle.id)
      ? vehicle.id
      : undefined;

  const stableId =
    rawId ||
    createStableId(
      [
        sanitizeText(vehicle.slug),
        title,
        sanitizeText(vehicle.price),
        sanitizeText(vehicle.city),
      ]
        .filter(Boolean)
        .join("|")
    );

  const image = normalizeImage(vehicle.image);

  return {
    id: stableId,
    slug: sanitizeText(vehicle.slug),
    title,
    brand,
    model: sanitizeText(vehicle.model),
    city: location.city,
    state: location.state,
    year: extractYear(vehicle.yearModel),
    mileage: extractMileage(vehicle.km),
    price: toNumber(vehicle.price),
    below_fipe: belowFipe,
    highlight_until: highlight ? new Date().toISOString() : null,
    image_url: image,
    images: image ? [image] : null,
  };
}

export function legacyCarCardToAdItem(car: LegacyCarCardInput): AdItem {
  const title = sanitizeText(car.title) || "Veículo";
  const image = normalizeImage(car.image);

  const stableId =
    typeof car.id === "number" && Number.isFinite(car.id)
      ? car.id
      : createStableId(
          [
            sanitizeText(car.slug),
            title,
            String(car.price ?? ""),
            sanitizeText(car.city),
            sanitizeText(car.state),
          ]
            .filter(Boolean)
            .join("|")
        );

  return {
    id: stableId,
    slug: sanitizeText(car.slug),
    title,
    city: sanitizeText(car.city),
    state: sanitizeText(car.state)?.toUpperCase(),
    price: toNumber(car.price),
    below_fipe: Boolean(car.discount),
    highlight_until: car.sponsored ? new Date().toISOString() : null,
    image_url: image,
    images: image ? [image] : null,
  };
}
