/**
 * Barrel export — contratos públicos consolidados (briefing P2 2026-05-25).
 *
 * Páginas/componentes públicos importam DAQUI:
 *
 *   import {
 *     normalizePublicAd,
 *     normalizePublicAdList,
 *     formatPricePublic,
 *     buildPublicVehicleHref,
 *     buildPublicTerritoryLabel,
 *     buildEmptyStateCopy,
 *     publicCatalogPageCopy,
 *     PUBLIC_BADGE_LABELS,
 *     resolvePublicAdBadges,
 *   } from "@/lib/public-contracts";
 *
 * Esses 7+ helpers são a INTERFACE única do contrato público:
 * mudanças no contrato (rótulo de badge, formato de preço, copy de
 * empty state) acontecem aqui — Pages/Components apenas consomem.
 */

export type { PublicAd, PublicAdBadgeSignals } from "./types";

export { formatPricePublic, type FormatPricePublicOptions } from "./format-price-public";

export { buildPublicVehicleHref, type AdLikeForHref } from "./build-public-vehicle-href";

export {
  buildPublicTerritoryLabel,
  type TerritoryInput,
  type RegionTerritoryInput,
} from "./build-public-territory-label";

export {
  buildEmptyStateCopy,
  type EmptyStateVariant,
  type EmptyStateContext,
  type EmptyStateCopy,
} from "./build-empty-state-copy";

export {
  publicCatalogPageCopy,
  type CatalogPageVariant,
  type CatalogPageCopyContext,
  type CatalogPageCopy,
} from "./public-catalog-page-copy";

export {
  PUBLIC_BADGE_LABELS,
  PUBLIC_BADGE_IDS_ALLOWED,
  isPublicBadge,
  resolvePublicAdBadges,
  inferAdTier,
  type PublicAdBadge,
  type PublicAdBadgeId,
  type PublicAdBadgeVariant,
  type PublicAdBadgeSignalsInput,
} from "./public-badge-labels";

export {
  normalizePublicAd,
  normalizePublicAdList,
  type NormalizePublicAdOptions,
} from "./normalize-public-ad";
