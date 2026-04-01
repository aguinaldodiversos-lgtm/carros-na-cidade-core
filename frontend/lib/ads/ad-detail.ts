export interface PublicAdDetail {
  id: number | string;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | string | null;
  city?: string | null;
  state?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: number | string | null;
  mileage?: number | string | null;
  body_type?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
  below_fipe?: boolean | null;
  highlight_until?: string | null;
  plan?: string | null;
  advertiser_id?: number | string | null;
  city_slug?: string | null;
  image_url?: string | null;
  images?: string[] | string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdDetailResponse {
  success?: boolean;
  data?: PublicAdDetail;
  ad?: PublicAdDetail;
  item?: PublicAdDetail;
}

import { getBackendApiBaseUrl } from "@/lib/env/backend-api";

const FALLBACK_IMAGE = "/images/hero.jpeg";

function getApiBaseUrl(): string {
  return getBackendApiBaseUrl() || "http://localhost:4000";
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function toNullableText(value: unknown): string | null {
  const text = toText(value, "");
  return text || null;
}

function toId(value: unknown, fallback: string): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function toNumberOrString(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  }
  return null;
}

function getImageFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [
      obj.url,
      obj.src,
      obj.image,
      obj.image_url,
      obj.cover_image,
      obj.photo,
      obj.thumb,
      obj.thumbnail,
      obj.large,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function normalizeImages(value: unknown, imageUrl?: string | null): string[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map(getImageFromUnknown)
      .filter((item): item is string => Boolean(item));

    if (normalized.length > 0) return normalized;
  }

  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();

    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map(getImageFromUnknown)
            .filter((item): item is string => Boolean(item));

          if (normalized.length > 0) return normalized;
        }
      } catch {
        // segue fluxo
      }
    }

    const commaSeparated = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (commaSeparated.length > 1) return commaSeparated;
    return [raw];
  }

  if (imageUrl && imageUrl.trim()) return [imageUrl.trim()];

  return [FALLBACK_IMAGE];
}

function normalizeAdDetail(raw: unknown, requestedIdentifier: string): PublicAdDetail | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;

  const imageUrl =
    getImageFromUnknown(item.image_url) ||
    getImageFromUnknown(item.image) ||
    getImageFromUnknown(item.cover_image) ||
    getImageFromUnknown(item.photo);

  const images = normalizeImages(item.images ?? item.gallery ?? item.photos, imageUrl);

  const titleFallback =
    [
      toText(item.year || item.year_model),
      toText(item.brand),
      toText(item.model),
      toText(item.version),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Veículo";

  return {
    id: toId(item.id, requestedIdentifier),
    slug: toNullableText(item.slug) || requestedIdentifier,
    title: toNullableText(item.title) || titleFallback,
    description: toNullableText(item.description),
    price: toNumberOrString(item.price),
    city: toNullableText(item.city) || "São Paulo",
    state: toNullableText(item.state) || "SP",
    brand: toNullableText(item.brand),
    model: toNullableText(item.model),
    version: toNullableText(item.version),
    year: toNumberOrString(item.year ?? item.year_model),
    mileage: toNumberOrString(item.mileage ?? item.km),
    body_type: toNullableText(item.body_type ?? item.bodyStyle ?? item.body),
    fuel_type: toNullableText(item.fuel_type ?? item.fuel),
    transmission: toNullableText(item.transmission),
    below_fipe: toBooleanOrNull(item.below_fipe ?? item.isBelowFipe),
    highlight_until: toNullableText(item.highlight_until),
    plan: toNullableText(item.plan),
    advertiser_id:
      item.advertiser_id != null && item.advertiser_id !== ""
        ? toNumberOrString(item.advertiser_id)
        : null,
    city_slug: toNullableText(item.city_slug),
    image_url: imageUrl || FALLBACK_IMAGE,
    images,
    created_at: toNullableText(item.created_at ?? item.createdAt),
    updated_at: toNullableText(item.updated_at ?? item.updatedAt),
  };
}

function extractPayload(json: unknown): unknown {
  if (!json || typeof json !== "object") return null;

  const payload = json as Record<string, unknown>;

  if (payload.data && typeof payload.data === "object") return payload.data;
  if (payload.ad && typeof payload.ad === "object") return payload.ad;
  if (payload.item && typeof payload.item === "object") return payload.item;
  if (payload.vehicle && typeof payload.vehicle === "object") return payload.vehicle;
  if (payload.listing && typeof payload.listing === "object") return payload.listing;

  return payload;
}

function buildFallbackAd(identifier: string): PublicAdDetail {
  return {
    id: identifier,
    slug: identifier,
    title: "Veículo não encontrado",
    description:
      "Não foi possível carregar os dados completos deste anúncio no momento. Tente novamente em instantes.",
    price: null,
    city: "São Paulo",
    state: "SP",
    brand: null,
    model: null,
    version: null,
    year: null,
    mileage: null,
    body_type: null,
    fuel_type: null,
    transmission: null,
    below_fipe: null,
    highlight_until: null,
    plan: null,
    advertiser_id: null,
    city_slug: null,
    image_url: FALLBACK_IMAGE,
    images: [FALLBACK_IMAGE],
    created_at: null,
    updated_at: null,
  };
}

function buildCandidatePaths(identifier: string): string[] {
  const encoded = encodeURIComponent(identifier);

  return [
    `/api/ads/${encoded}`,
    `/api/ads/slug/${encoded}`,
    `/api/ads/by-slug/${encoded}`,
    `/ads/${encoded}`,
    `/public/ads/${encoded}`,
    `/public/listings/${encoded}`,
    `/catalog/ads/${encoded}`,
  ];
}

async function tryFetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 300,
      },
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchAdDetail(identifier: string): Promise<PublicAdDetail> {
  const safeIdentifier = toText(identifier, "").trim();

  if (!safeIdentifier) {
    return buildFallbackAd("sem-identificador");
  }

  const apiBase = getApiBaseUrl();
  const candidatePaths = buildCandidatePaths(safeIdentifier);

  for (const path of candidatePaths) {
    const json = await tryFetchJson(`${apiBase}${path}`);
    if (!json) continue;

    const payload = extractPayload(json);
    const normalized = normalizeAdDetail(payload, safeIdentifier);

    if (normalized) {
      return normalized;
    }
  }

  return buildFallbackAd(safeIdentifier);
}
