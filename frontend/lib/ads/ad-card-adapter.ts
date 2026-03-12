import type { AdItem } from "@/lib/search/ads-search";
import type { ListingCar } from "@/lib/car-data";

type LegacyCarCardInput = {
  slug?: string;
  title: string;
  image: string;
  city?: string;
  state?: string;
  sponsored?: boolean;
  discount?: number | string;
  price: string;
};

function toNumber(value?: string | number | null) {
  if (typeof value === "number") return value;
  if (!value) return undefined;

  const parsed = Number(
    String(value)
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  );

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCityState(value?: string) {
  if (!value) {
    return { city: undefined, state: undefined };
  }

  const normalized = value.trim();

  const parenthesisMatch = normalized.match(/^(.*)\s+\(([A-Za-z]{2})\)$/);
  if (parenthesisMatch) {
    return {
      city: parenthesisMatch[1]?.trim() || undefined,
      state: parenthesisMatch[2]?.trim().toUpperCase() || undefined,
    };
  }

  const dashParts = normalized.split(" - ").map((item) => item.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return {
      city: dashParts[0],
      state: dashParts[1]?.toUpperCase(),
    };
  }

  return { city: normalized, state: undefined };
}

function extractYear(yearModel?: string) {
  const match = String(yearModel || "").match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

function extractMileage(km?: string) {
  const numeric = String(km || "").replace(/\D/g, "");
  if (!numeric) return undefined;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function listingCarToAdItem(vehicle: ListingCar): AdItem {
  const location = parseCityState(vehicle.city);

  return {
    id: Number(vehicle.id) || Math.abs(
      String(vehicle.id)
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    ),
    slug: vehicle.slug,
    title: [vehicle.model, vehicle.version].filter(Boolean).join(" "),
    brand: vehicle.model.split(" ")[0] || vehicle.model,
    model: vehicle.model,
    city: location.city,
    state: location.state,
    year: extractYear(vehicle.yearModel),
    mileage: extractMileage(vehicle.km),
    price: toNumber(vehicle.price),
    below_fipe: vehicle.badge === "fipe",
    highlight_until: vehicle.badge === "destaque" ? new Date().toISOString() : null,
    image_url: vehicle.image,
    images: vehicle.image ? [vehicle.image] : null,
  };
}

export function legacyCarCardToAdItem(car: LegacyCarCardInput): AdItem {
  return {
    id: Math.abs(
      `${car.slug || car.title}-${car.price}`
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    ),
    slug: car.slug,
    title: car.title,
    city: car.city,
    state: car.state,
    price: toNumber(car.price),
    below_fipe: Boolean(car.discount),
    highlight_until: car.sponsored ? new Date().toISOString() : null,
    image_url: car.image,
    images: car.image ? [car.image] : null,
  };
}
