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

const FALLBACK_IMAGE = "/images/hero.jpeg";

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumberOrString(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function normalizeImages(value: unknown, imageUrl?: string | null): string[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);

    if (normalized.length > 0) return normalized;
  }

  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();

    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean);

          if (normalized.length > 0) return normalized;
        }
      } catch {
        // segue para fallback simples
      }
    }

    return [raw];
  }

  if (imageUrl && imageUrl.trim()) return [imageUrl.trim()];

  return [FALLBACK_IMAGE];
}

function normalizeAdDetail(raw: unknown, requestedIdentifier: string): PublicAdDetail | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;

  const imageUrl =
    toNullableText(item.image_url) ||
    toNullableText(item.image) ||
    toNullableText(item.cover_image);

  const images = normalizeImages(item.images, imageUrl);

  const fallbackTitle =
    [
      toText(item.brand),
      toText(item.model),
      toText(item.version),
      toText(item.year),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Veículo";

  return {
    id: (item.id as number | string | undefined) ?? requestedIdentifier,
    slug: toNullableText(item.slug) || requestedIdentifier,
    title: toNullableText(item.title) || fallbackTitle,
    description: toNullableText(item.description),
    price: toNumberOrString(item.price),
    city: toNullableText(item.city) || "São Paulo",
    state: toNullableText(item.state) || "SP",
    brand: toNullableText(item.brand),
    model: toNullableText(item.model),
    version: toNullableText(item.version),
    year: toNumberOrString(item.year),
    mileage: toNumberOrString(item.mileage),
    body_type: toNullableText(item.body_type) || toNullableText(item.bodyStyle),
    fuel_type: toNullableText(item.fuel_type) || toNullableText(item.fuel),
    transmission: toNullableText(item.transmission),
    below_fipe: toBooleanOrNull(item.below_fipe),
    highlight_until: toNullableText(item.highlight_until),
    plan: toNullableText(item.plan),
    image_url: imageUrl || FALLBACK_IMAGE,
    images,
    created_at: toNullableText(item.created_at),
    updated_at: toNullableText(item.updated_at),
  };
}

function extractPayload(json: unknown): unknown {
  if (!json || typeof json !== "object") return null;

  const payload = json as Record<string, unknown>;

  if (payload.data && typeof payload.data === "object") return payload.data;
  if (payload.ad && typeof payload.ad === "object") return payload.ad;
  if (payload.item && typeof payload.item === "object") return payload.item;

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
    return buildFallbackAd("sem-slug");
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
