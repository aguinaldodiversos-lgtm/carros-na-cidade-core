// frontend/lib/dealers/fetch-public-dealer.ts
//
// Cliente SSR-friendly do endpoint `/api/public/dealers/:slug`. Retorna
// `null` em 404 — caller chama `notFound()` para emitir 404 real
// (vitrine pública não renderiza "Loja não encontrada" com lista vazia
// e status 200).
//
// Briefing 2026-05-25 (Lojas Públicas): aplicar `normalizePublicAd`
// nos anúncios devolvidos pelo backend e descartar qualquer ad cujo
// shape público seja inválido (sem slug, R$ 0, dirty data).

import { getBackendApiBaseUrl, getInternalBackendApiBaseUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import { normalizePublicAd, type PublicAd } from "@/lib/public-contracts";
import type { AdItem } from "@/lib/search/ads-search";

/** Shape do `dealer` no payload — campos públicos somente. */
export interface PublicDealer {
  id: number;
  slug: string;
  /** Nome de display (preferência: `company_name`, fallback `name`). */
  name: string;
  /** Loja verificada por moderação interna. */
  verified: boolean;
  city: string | null;
  state: string | null;
  citySlug: string | null;
  totalActiveAds: number;
}

/** Payload completo da página. */
export interface PublicDealerPayload {
  dealer: PublicDealer;
  /** Anúncios prontos para os cards públicos (após `normalizePublicAd`). */
  ads: PublicAd[];
  /** Raw `AdItem`s devolvidos pelo backend — útil pra normalizadores
   *  downstream que ainda dependem do shape do search. */
  rawAds: AdItem[];
}

interface BackendShape {
  success?: boolean;
  data?: {
    dealer?: Record<string, unknown> | null;
    ads?: unknown[] | null;
  };
}

function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    const internal = getInternalBackendApiBaseUrl();
    if (internal) return internal;
  }
  return getBackendApiBaseUrl();
}

/**
 * Lojas Públicas 2026-05-25 — defesa contra encoding quebrado vazado
 * do banco. Algumas linhas em `cities`/`advertisers` foram salvas com
 * Latin-1 lido como UTF-8 ("São Paulo" → "SÆo Paulo"). O smoke
 * público (FORBIDDEN_PATTERNS.encoding-sao-paulo) bloqueia esse
 * padrão. Sanitizamos no fetcher para impedir que vaze ao HTML.
 *
 * Lista é estreita por design — sanitiza apenas padrões conhecidos,
 * sem tentar "consertar" bytes arbitrários. Quando aparecer outro
 * padrão, estende aqui (e marca para corrigir o dado no banco).
 */
const ENCODING_FIXES: Array<[RegExp, string]> = [
  [/SÆo Paulo/g, "São Paulo"], // "SÆo Paulo" → "São Paulo"
];

function fixEncoding(value: string): string {
  let out = value;
  for (const [pattern, replacement] of ENCODING_FIXES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? fixEncoding(value.trim()) : "";
}

function toBooleanSafe(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function toIntSafe(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function parseDealer(raw: unknown): PublicDealer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = toIntSafe(r.id, 0);
  const slug = toStringSafe(r.slug);
  if (!id || !slug) return null;

  return {
    id,
    slug,
    name: toStringSafe(r.name) || "Loja parceira",
    verified: toBooleanSafe(r.verified),
    city: toStringSafe(r.city) || null,
    state: toStringSafe(r.state) || null,
    citySlug: toStringSafe(r.city_slug) || null,
    totalActiveAds: toIntSafe(r.total_active_ads, 0),
  };
}

function castRawAds(raw: unknown): AdItem[] {
  return Array.isArray(raw) ? (raw as AdItem[]) : [];
}

/**
 * GET `/api/public/dealers/:slug`. Retorna `null` quando:
 *   - slug vazio;
 *   - backend respondeu não-200 (incluindo 404);
 *   - payload sem `data.dealer` válido.
 *
 * Anúncios são normalizados via `normalizePublicAd` — ads que não
 * passarem o contrato público são silenciosamente descartados.
 */
export async function fetchPublicDealer(slug: string): Promise<PublicDealerPayload | null> {
  const safe = toStringSafe(slug);
  if (!safe) return null;

  const apiBase = getApiBaseUrl();
  const url = `${apiBase}/api/public/dealers/${encodeURIComponent(safe)}`;

  let response: Response;
  try {
    response = await ssrResilientFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      logTag: "public-dealer",
      next: { revalidate: 60 },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let json: BackendShape;
  try {
    json = (await response.json()) as BackendShape;
  } catch {
    return null;
  }

  const dealer = parseDealer(json?.data?.dealer);
  if (!dealer) return null;

  const rawAds = castRawAds(json?.data?.ads);
  const ads: PublicAd[] = [];
  for (const raw of rawAds) {
    const normalized = normalizePublicAd(raw);
    if (normalized) ads.push(normalized);
  }

  // Defesa: ajusta `totalActiveAds` ao que sobreviveu à sanitização do
  // contrato público. Se o backend filtrou 12 mas 2 são DIRTY que
  // escaparam ao SQL guard, exibimos 10 — sem mentir pra UI.
  const totalActiveAds = ads.length;

  return {
    dealer: { ...dealer, totalActiveAds },
    ads,
    rawAds,
  };
}
