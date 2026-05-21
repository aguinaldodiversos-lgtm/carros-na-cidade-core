import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";

/**
 * Gate territorial executado no middleware (Edge runtime) ANTES do
 * Next router pegar as rotas dinâmicas `/carros-usados/[uf]` e
 * `/carros-em/[slug]`. Necessário porque o Next 14.2 retorna HTTP 200
 * com body "not-found global" quando `notFound()` é chamado em ISR
 * (mesmo bug documentado em `regional-page-guard`).
 *
 * Sem este gate:
 *   /carros-usados/zz       → 200 + soft-404 UI (Google indexa lixo)
 *   /carros-em/falsa-xx     → 200 + soft-404 UI
 *
 * Com este gate:
 *   /carros-usados/zz       → 404 HTTP real
 *   /carros-em/falsa-xx     → 404 HTTP real
 *
 * Decisões puras sem dependência de `NextRequest/NextResponse` para
 * facilitar teste unitário e portabilidade.
 */

const VALID_UFS: ReadonlySet<string> = new Set<string>(
  BRAZIL_UFS.map((u) => u.value)
);

/**
 * Captura `/carros-usados/[uf]` (2 segmentos). NÃO casa com
 * `/carros-usados/regiao/[slug]` (3 segmentos, literal "regiao").
 */
const STATE_ROUTE_RE = /^\/carros-usados\/([^/]+)\/?$/;

/**
 * Captura `/carros-em/[slug]`. Slug canônico deve terminar em UF
 * brasileira real (ex: "atibaia-sp", "belo-horizonte-mg").
 */
const CITY_ROUTE_RE = /^\/carros-em\/([^/]+)\/?$/;

/**
 * Captura `/comprar/estado/[uf]` (rota legada estadual). Mesma defesa
 * 404 real do gate canônico — alias compatibilidade não pode emitir
 * soft-404 para UF inválida.
 */
const LEGACY_STATE_ROUTE_RE = /^\/comprar\/estado\/([^/]+)\/?$/;

export function isValidBrUf(raw: string): boolean {
  if (!raw) return false;
  const upper = String(raw).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && VALID_UFS.has(upper);
}

/** Extrai a UF candidata do final do slug (`"atibaia-sp"` → `"sp"`). */
export function extractSlugUf(slug: string): string | null {
  if (!slug) return null;
  const parts = String(slug).trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}

export type TerritoryGateDecision =
  | { kind: "pass" }
  | { kind: "block-state-uf-invalid"; uf: string }
  | { kind: "block-legacy-state-uf-invalid"; uf: string }
  | { kind: "block-city-slug-invalid"; slug: string };

/**
 * Decide se o pathname deve passar pelo gate ou ser bloqueado com 404
 * real. Retorna `pass` para qualquer rota que não case com `/carros-
 * usados/[uf]`, `/carros-em/[slug]` ou `/comprar/estado/[uf]` (alias
 * legado).
 */
export function decideTerritoryGate(pathname: string): TerritoryGateDecision {
  const stateMatch = STATE_ROUTE_RE.exec(pathname);
  if (stateMatch) {
    const uf = stateMatch[1];
    if (!isValidBrUf(uf)) {
      return { kind: "block-state-uf-invalid", uf };
    }
    return { kind: "pass" };
  }

  const legacyStateMatch = LEGACY_STATE_ROUTE_RE.exec(pathname);
  if (legacyStateMatch) {
    const uf = legacyStateMatch[1];
    if (!isValidBrUf(uf)) {
      return { kind: "block-legacy-state-uf-invalid", uf };
    }
    return { kind: "pass" };
  }

  const cityMatch = CITY_ROUTE_RE.exec(pathname);
  if (cityMatch) {
    const slug = cityMatch[1];
    const slugUf = extractSlugUf(slug);
    if (!slugUf || !isValidBrUf(slugUf)) {
      return { kind: "block-city-slug-invalid", slug };
    }
    return { kind: "pass" };
  }

  return { kind: "pass" };
}
