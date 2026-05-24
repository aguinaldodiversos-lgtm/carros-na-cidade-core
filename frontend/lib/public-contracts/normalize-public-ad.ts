/**
 * Normalizador único de anúncio para superfícies públicas — briefing P2 2026-05-25.
 *
 * Recebe um objeto vindo do backend (`AdItem` do search OU
 * `PublicAdDetail` do detail OU `BaseAdData` legado) e devolve um
 * `PublicAd` saneado — ou `null` quando o ad NÃO é renderizável.
 *
 * Regras invariantes:
 *   1. price 0 / null → ad fica com `price: null` (caller usa
 *      `formatPricePublic` que devolve "Sob consulta" sem renderizar
 *      "R$ 0").
 *   2. slug vazio E id ausente → retorna `null` (card sem href possível).
 *   3. city/state ausentes → ficam `null` (callers usam
 *      `buildPublicTerritoryLabel` que devolve "Localização não informada").
 *   4. dados de teste (test/teste/deploy/etc em title/model) → backend já
 *      filtra via DIRTY_TEST_AD_GUARD; mas como defesa em profundidade,
 *      checamos novamente aqui — devolve `null`.
 *
 * Composição: este normalizador NÃO substitui `normalizeAdItem`
 * (search) nem `normalizeAdDetail` (detail) — esses continuam fazendo
 * o trabalho de parsing/coerção de tipo do payload do backend.
 * `normalizePublicAd` é o ÚLTIMO passo antes do componente consumir.
 */

import type { PublicAd, PublicAdBadgeSignals } from "./types";

// Pega palavras-token isoladas (\b) + concatenações conhecidas como
// "deploymodel" (compound) sem disparar FP em "atestado"/"autotest".
const DIRTY_PATTERNS =
  /\b(test|teste|seed|deploy|worker|alerta|fake|dummy|sample)\b|deploymodel/i;

function toText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toNullableText(value: unknown): string | null {
  const t = toText(value);
  return t || null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toPositiveInteger(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n == null || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function toPriorityTier(value: unknown): 1 | 2 | 3 | 4 | null {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

function toSellerKind(value: unknown): "dealer" | "private" | null {
  const t = toText(value).toLowerCase();
  if (t === "dealer") return "dealer";
  if (t === "private") return "private";
  return null;
}

function pickImageUrl(raw: Record<string, unknown>): string | null {
  // Preserva o que `collectVehicleImageCandidates` já fez upstream.
  // Aqui só pega o primeiro valor utilizável dos campos mais comuns.
  const candidates = [
    raw.image_url,
    raw.image,
    raw.cover_image_url,
    raw.cover_image,
    raw.thumbnail,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  if (Array.isArray(raw.images) && raw.images.length > 0) {
    const first = raw.images[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return null;
}

function buildTitle(brand: string | null, model: string | null, raw: Record<string, unknown>): string {
  const explicitTitle = toText(raw.title);
  if (explicitTitle) return explicitTitle;
  const composed = [brand, model].filter(Boolean).join(" ").trim();
  return composed || "Veículo";
}

function isDirty(value: string | null): boolean {
  return value != null && DIRTY_PATTERNS.test(value);
}

export interface NormalizePublicAdOptions {
  /**
   * Drop ads sem preço (price <= 0). Default `true` — vitrines públicas
   * nunca devem mostrar "Sob consulta" em cards de catálogo onde compra
   * é por preço. Páginas que quiserem aceitar (ex.: futuras "consultar
   * vendedor") podem passar `false`.
   */
  requirePrice?: boolean;
  /**
   * Drop ads sem slug E sem id válido. Default `true` — card sem href
   * possível é fake. Não há razão prática para desligar.
   */
  requireHref?: boolean;
}

export function normalizePublicAd(
  raw: unknown,
  options: NormalizePublicAdOptions = {}
): PublicAd | null {
  if (!raw || typeof raw !== "object") return null;

  const requirePrice = options.requirePrice ?? true;
  const requireHref = options.requireHref ?? true;

  const item = raw as Record<string, unknown>;

  const id = toPositiveInteger(item.id);
  const slug = toNullableText(item.slug);
  const brand = toNullableText(item.brand);
  const model = toNullableText(item.model);
  const version = toNullableText(item.version);
  const title = buildTitle(brand, model, item);
  const price = toFiniteNumber(item.price);
  const city = toNullableText(item.city);
  const state = toNullableText(item.state)?.toUpperCase() ?? null;
  const citySlug = toNullableText(item.city_slug ?? item.citySlug);

  // Defesa em profundidade — descarta se dirty escapar do backend.
  if (isDirty(title) || isDirty(model) || isDirty(slug)) {
    return null;
  }

  // Sem id, sem slug → impossível roteamento. Drop.
  if (requireHref && !slug && id == null) return null;

  // Sem preço utilizável → card de catálogo não pode mostrar "R$ 0".
  // Caller que aceita pode setar requirePrice=false.
  const usablePrice = price != null && price > 0 ? price : null;
  if (requirePrice && usablePrice == null) return null;

  // id pode ser null em payloads parciais — mantemos como 0 sentinel
  // só quando requireHref=false (caller já decidiu permitir).
  const safeId = id ?? 0;

  const badges: PublicAdBadgeSignals = {
    priorityTier: toPriorityTier(item.priority_tier),
    highlightUntil: toNullableText(item.highlight_until),
    belowFipe: item.below_fipe === true,
    opportunity: item.opportunity === true,
    sellerKind: toSellerKind(item.seller_kind),
    reviewedAfterBelowFipe: item.reviewed_after_below_fipe === true,
  };

  return {
    id: safeId,
    slug,
    title,
    brand,
    model,
    version,
    year: toPositiveInteger(item.year),
    mileage: toPositiveInteger(item.mileage),
    price: usablePrice,
    city,
    state,
    citySlug,
    image: pickImageUrl(item),
    badges,
  };
}

/**
 * Aplica `normalizePublicAd` numa lista, descartando os ads sem
 * preço/href. Útil para Páginas que recebem `AdItem[]` do backend.
 */
export function normalizePublicAdList(
  raws: readonly unknown[],
  options?: NormalizePublicAdOptions
): PublicAd[] {
  const out: PublicAd[] = [];
  for (const raw of raws) {
    const ad = normalizePublicAd(raw, options);
    if (ad) out.push(ad);
  }
  return out;
}
