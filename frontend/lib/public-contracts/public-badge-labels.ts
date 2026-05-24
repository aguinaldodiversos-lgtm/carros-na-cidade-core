/**
 * Labels dos selos PÚBLICOS — briefing P2 2026-05-25.
 *
 * Re-exporta `resolvePublicAdBadges` (canônico em `lib/ads/ad-badges.ts`)
 * + mapa estático de IDs → labels. Garante que nenhuma rota recém-criada
 * invente label novo para os mesmos sinais.
 *
 * Selos PÚBLICOS (vitrine):
 *   - Destaque             (priority_tier === 4)
 *   - Oportunidade         (opportunity === true; ≥10% abaixo da FIPE)
 *   - Abaixo da FIPE       (below_fipe === true; qualquer margem)
 *   - Loja                 (seller_kind === "dealer")
 *   - Particular           (seller_kind === "private")
 *   - Anúncio analisado    (reviewed_after_below_fipe === true)
 *
 * NUNCA são exibidos em vitrine (admin-only):
 *   - Lojista Pro          (priority_tier === 3 — bastidor comercial)
 *   - Lojista Start        (priority_tier === 2 — bastidor comercial)
 *
 * Briefing P2: "Não expor nomes internos de plano/ranking nos cards
 * públicos." → guard em `assertPublicBadge` valida em runtime no dev.
 */

export {
  resolvePublicAdBadges,
  inferAdTier,
  type AdBadge as PublicAdBadge,
  type AdBadgeId as PublicAdBadgeId,
  type AdBadgeVariant as PublicAdBadgeVariant,
  type AdBadgeSignals as PublicAdBadgeSignalsInput,
} from "../ads/ad-badges";

import type { AdBadgeId } from "../ads/ad-badges";

/**
 * Mapa estático de label canônico por ID. Use para renderização explícita
 * (ex.: legenda de filtro, tooltip) onde `resolvePublicAdBadges` não cabe.
 *
 * Para `pro`/`start` o label NÃO é "Lojista Pro"/"Lojista Start" — esses
 * só viajam em painel admin. Aqui mantemos um placeholder técnico para
 * que TS exija explicitamente o uso administrativo.
 */
// Labels em CAPS para alinhar com a fonte canônica `resolvePublicAdBadges`
// em `lib/ads/ad-badges.ts` — o AdCard já renderiza assim e o briefing P2
// veta mudança visual.
export const PUBLIC_BADGE_LABELS: Record<AdBadgeId, string> = {
  destaque: "DESTAQUE",
  opportunity: "OPORTUNIDADE",
  below_fipe: "ABAIXO DA FIPE",
  loja: "LOJA",
  particular: "PARTICULAR",
  reviewed: "ANÚNCIO ANALISADO",
  // Admin-only — uso público não deve renderizar estes IDs.
  pro: "[admin] Pro",
  start: "[admin] Start",
};

/**
 * Conjunto fechado de IDs que PODEM aparecer em UI pública.
 * Use `assertPublicBadge(id)` para falhar fast em dev se alguém tentar
 * passar `pro`/`start` para vitrine.
 */
export const PUBLIC_BADGE_IDS_ALLOWED: ReadonlySet<AdBadgeId> = new Set<AdBadgeId>([
  "destaque",
  "opportunity",
  "below_fipe",
  "loja",
  "particular",
  "reviewed",
]);

export function isPublicBadge(id: AdBadgeId): boolean {
  return PUBLIC_BADGE_IDS_ALLOWED.has(id);
}
