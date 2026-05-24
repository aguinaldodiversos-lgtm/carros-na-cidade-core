/**
 * Gerador único de href para o detalhe público de anúncio.
 * Briefing P2 2026-05-25.
 *
 * Substitui o padrão repetido `` `/veiculo/${ad.slug || ad.id}` `` espalhado
 * por catalog/related/jsonld. Regras explícitas:
 *
 *   1. slug válido (não-vazio, sem chars proibidos) → /veiculo/<slug>
 *   2. apenas id numérico → /veiculo/<id> (middleware ad-detail-gate
 *      aceita id numérico — `extractAdDetailMatch` casa qualquer
 *      `[^/?#]+`, controller faz lookup por id quando `/^\d+$/`).
 *   3. ambos ausentes → null (caller NÃO renderiza o card)
 *
 * Nunca devolve href para detalhe sabidamente quebrado — caller pode
 * confiar que receber string significa "rota tem chance de resolver".
 */

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

function isValidSlug(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.length > 200) return false; // hard cap defensivo
  return VALID_SLUG_REGEX.test(trimmed);
}

function isPositiveIntegerLike(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return false;
    const n = Number(value.trim());
    return Number.isInteger(n) && n > 0;
  }
  return false;
}

export interface AdLikeForHref {
  slug?: string | null;
  id?: number | string | null;
}

export function buildPublicVehicleHref(ad: AdLikeForHref | null | undefined): string | null {
  if (!ad) return null;

  const slug = typeof ad.slug === "string" ? ad.slug.trim() : "";
  if (isValidSlug(slug)) {
    return `/veiculo/${slug}`;
  }

  if (isPositiveIntegerLike(ad.id)) {
    return `/veiculo/${String(ad.id).trim()}`;
  }

  return null;
}
