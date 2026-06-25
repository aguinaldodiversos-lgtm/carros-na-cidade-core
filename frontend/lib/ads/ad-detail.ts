import { getBackendApiBaseUrl, getInternalBackendApiBaseUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import { collectVehicleImageCandidates } from "@/lib/vehicle/detail-utils";

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
  seller_name?: string | null;
  /**
   * Tipo do anunciante (`dealer`, `dealership`, `loja`, `premium`, `basic`,
   * `private`...). Importante manter no payload público para o detalhe não
   * exibir loja como "Anunciante particular" quando `dealership_name` não
   * tiver sido preenchido (caso real do Onix sinalizado).
   */
  seller_type?: string | null;
  /**
   * Veredito canônico do backend trust pass ('dealer'|'private') —
   * frontend prefere este campo sobre `seller_type`/heurísticas locais.
   */
  seller_kind?: string | null;
  /** users.document_type ('CPF'|'CNPJ') do dono do anúncio. */
  account_type?: string | null;
  /** id do registro em advertisers (loja registrada). */
  dealership_id?: number | string | null;
  /**
   * Slug canônico do `advertisers.slug` (gerado em `ensureAdvertiserForUser`).
   * Quando presente + `seller_kind === "dealer"`, frontend pode linkar o
   * card da loja para `/lojas/[advertiser_slug]`. Ausência → não linkar.
   */
  advertiser_slug?: string | null;
  /**
   * Backend marca true quando o anúncio entrou em pending_review por
   * sinal de preço abaixo da FIPE e foi aprovado pela moderação.
   * Renderizar como selo "Anúncio analisado" — nunca como garantia.
   */
  reviewed_after_below_fipe?: boolean | null;
  dealership_name?: string | null;
  color?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  whatsapp_number?: string | null;
  image_url?: string | null;
  cover_image?: string | null;
  thumbnail?: string | null;
  photo?: string | null;
  images?: string[] | string | Record<string, unknown>[] | null;
  /**
   * Opcionais do veículo (jsonb agrupado por categoria, vindo do backend).
   * Forma tolerada: objeto agrupado, array de keys, string JSON ou null.
   * Interpretado por `buildSelectedOptionGroups` (lib/ads/vehicle-options).
   */
  vehicle_options?: Record<string, string[]> | string[] | string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdDetailResponse {
  success?: boolean;
  data?: PublicAdDetail;
  ad?: PublicAdDetail;
  item?: PublicAdDetail;
}

function getApiBaseUrl(): string {
  // Server-side: prefer Private Network do Render se configurada.
  if (typeof window === "undefined") {
    const internal = getInternalBackendApiBaseUrl();
    if (internal) return internal;
  }
  const base = getBackendApiBaseUrl();
  if (base) return base;
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
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

function normalizeAdDetail(raw: unknown, requestedIdentifier: string): PublicAdDetail | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;

  const images = collectVehicleImageCandidates(
    item.images,
    item.gallery,
    item.photos,
    item.image_url,
    item.image,
    item.cover_image,
    item.thumbnail,
    item.photo
  );

  const imageUrl = images[0] || null;

  // Não incluir o ano no título — o detalhe do veículo já mostra o ano em
  // bloco separado (meta de cabeçalho). Concatenar aqui produz duplicação
  // visível ("Onix Hatch 2020 ... 2020 · 41.000 km · São Paulo (SP)").
  const titleFallback =
    [toText(item.brand), toText(item.model), toText(item.version)]
      .filter(Boolean)
      .join(" ")
      .trim() || "Veículo";

  return {
    id: toId(item.id, requestedIdentifier),
    slug: toNullableText(item.slug) || requestedIdentifier,
    title: toNullableText(item.title) || titleFallback,
    description: toNullableText(item.description),
    price: toNumberOrString(item.price),
    // city/state SEM defaults sintéticos (briefing P0 2026-05-24): se
    // backend não enviar, fica `null` — UI trata como "Localização não
    // informada" via `deriveCityDisplay` em `lib/vehicle/public-vehicle.ts`.
    // Antes defaultávamos para "São Paulo"/"SP", o que mostrava anúncio
    // de Atibaia como se fosse de SP no header do detalhe.
    city: toNullableText(item.city),
    state: toNullableText(item.state),
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
    seller_name: toNullableText(item.seller_name ?? item.sellerName ?? item.owner_name),
    seller_type: toNullableText(item.seller_type ?? item.sellerType),
    seller_kind: toNullableText(item.seller_kind),
    account_type: toNullableText(item.account_type ?? item.document_type),
    dealership_id:
      item.dealership_id != null && item.dealership_id !== ""
        ? toNumberOrString(item.dealership_id)
        : null,
    advertiser_slug: toNullableText(
      item.advertiser_slug ?? item.advertiserSlug ?? item.dealership_slug
    ),
    reviewed_after_below_fipe: item.reviewed_after_below_fipe === true,
    dealership_name: toNullableText(
      item.dealership_name ?? item.dealershipName ?? item.store_name ?? item.dealer_name
    ),
    color: toNullableText(item.color),
    phone: toNullableText(item.phone ?? item.phone_number ?? item.telefone),
    whatsapp: toNullableText(item.whatsapp ?? item.whatsappNumber ?? item.whatsapp_phone),
    whatsapp_number: toNullableText(item.whatsapp_number ?? item.whatsappNumber ?? item.whatsapp),
    image_url: imageUrl,
    cover_image: toNullableText(item.cover_image),
    thumbnail: toNullableText(item.thumbnail ?? item.thumb),
    photo: toNullableText(item.photo),
    images,
    vehicle_options: (item.vehicle_options ?? null) as PublicAdDetail["vehicle_options"],
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
    const response = await ssrResilientFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      logTag: "ad-detail",
      next: { revalidate: 300 },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Retorna o detalhe do anúncio ou `null` quando nenhum candidato de
 * endpoint backend devolve um registro válido. NUNCA monta um anúncio
 * sintético — chamadores devem mapear `null` para `notFound()` para que
 * o navegador receba 404 real (vitrine pública nunca pode renderizar
 * "Veículo não encontrado" com R$ 0/São Paulo fake).
 */
export async function fetchAdDetail(identifier: string): Promise<PublicAdDetail | null> {
  const safeIdentifier = toText(identifier, "").trim();
  if (!safeIdentifier) return null;

  const apiBase = getApiBaseUrl();
  const candidatePaths = buildCandidatePaths(safeIdentifier);

  for (const path of candidatePaths) {
    const json = await tryFetchJson(`${apiBase}${path}`);
    if (!json) continue;

    const payload = extractPayload(json);
    const normalized = normalizeAdDetail(payload, safeIdentifier);
    if (normalized) return normalized;
  }

  return null;
}
