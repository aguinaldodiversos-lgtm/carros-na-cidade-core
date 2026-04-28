// frontend/components/ads/AdCard.tsx
"use client";

import Link from "next/link";
import { useCallback, type ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { VehicleImage } from "@/components/ui/VehicleImage";
import { buildAdHref } from "@/lib/ads/build-ad-href";
import { useFavorites } from "@/lib/favorites/FavoritesContext";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";

/**
 * AdCard — componente OFICIAL e ÚNICO de card de anúncio.
 *
 * 8 variantes (DIAGNOSTICO_REDESIGN.md §10):
 *   - compact     — sidebar/resultados pequenos, 4:3, mínimo
 *   - featured    — hero/destaques, 16:9, com favorito
 *   - grid        — listagem catálogo, 4:3, com favorito
 *   - carousel    — home carrosséis, 4:3, com favorito
 *   - horizontal  — similares no detalhe, layout lateral
 *   - related     — após blog, 4:3, sem favorito
 *   - dashboard   — painel "meus anúncios", com status/actions
 *   - admin       — moderação, layout lateral com flags/actions
 *
 * Substitui as reimplementações paralelas:
 *   - HomeVehicleCard → adapter chama AdCard variant="featured"|"carousel"
 *   - CatalogVehicleCard → adapter chama AdCard variant="grid"
 *   - sections/VehicleCard → eliminado (era órfão)
 *
 * Adapters legados mantidos:
 *   - components/ads/CarCard.tsx
 *   - components/common/VehicleCard.tsx
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type BaseAdData = {
  id?: string | number | null;
  slug?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: string | number | null;
  yearLabel?: string | null;
  year_model?: string | number | null;
  city?: string | null;
  state?: string | null;
  price?: number | string | null;
  mileage?: number | string | null;
  image?: string | null;
  image_url?: string | null;
  cover_image_url?: string | null;
  cover_image?: string | null;
  storage_key?: string | null;
  images?: string[] | null;
  photos?: unknown;
  gallery?: unknown;
  badge?: string | null;
  below_fipe?: boolean | null;
  highlight_until?: string | null;
  catalogWeight?: 1 | 2 | 3 | 4 | null;
  plan?: string | null;
  dealership_id?: string | number | null;
  dealership_name?: string | null;
  dealer_name?: string | null;
  seller_type?: string | null;
};

export type AdCardVariant =
  | "compact"
  | "featured"
  | "grid"
  | "carousel"
  | "horizontal"
  | "related"
  | "dashboard"
  | "admin";

export type AdCardProps = {
  /** Alias de `item` (compat retroativa). */
  ad?: BaseAdData;
  item?: BaseAdData;
  variant?: AdCardVariant;
  /** Apenas para imagem acima da dobra. Default: false. */
  priority?: boolean;
  /** Override de href. Default: rota canônica /veiculo/[slug]. */
  href?: string;
  /** Status (dashboard/admin): "ativo", "pausado", "rejeitado", etc. */
  status?: string;
  /** Flags de moderação (admin). */
  flags?: ReadonlyArray<string>;
  /** Slot de ações custom (dashboard/admin). Botões devem chamar
   *  e.preventDefault()/stopPropagation() se não desejarem navegar. */
  actions?: ReactNode;
  className?: string;
};

// ---------------------------------------------------------------------------
// Configuração por variante
// ---------------------------------------------------------------------------

type VariantConfig = {
  imgVariant: "card" | "gallery" | "thumb" | "hero";
  imgWidth: number;
  imgHeight: number;
  aspectClass: string;
  layout: "vertical" | "horizontal";
  showFavorite: boolean;
  showMileageBadge: boolean;
  showDealerPill: boolean;
  showLocation: boolean;
  showYearLabel: boolean;
  showStatus: boolean;
  showAdminFlags: boolean;
};

const VARIANTS: Record<AdCardVariant, VariantConfig> = {
  compact: {
    imgVariant: "card",
    imgWidth: 320,
    imgHeight: 240,
    aspectClass: "aspect-[4/3]",
    layout: "vertical",
    showFavorite: false,
    showMileageBadge: true,
    showDealerPill: true,
    showLocation: true,
    showYearLabel: true,
    showStatus: false,
    showAdminFlags: false,
  },
  featured: {
    imgVariant: "hero",
    imgWidth: 800,
    imgHeight: 450,
    aspectClass: "aspect-[16/9]",
    layout: "vertical",
    showFavorite: true,
    showMileageBadge: true,
    showDealerPill: true,
    showLocation: true,
    showYearLabel: true,
    showStatus: false,
    showAdminFlags: false,
  },
  grid: {
    imgVariant: "card",
    imgWidth: 400,
    imgHeight: 300,
    aspectClass: "aspect-[4/3]",
    layout: "vertical",
    showFavorite: true,
    showMileageBadge: true,
    showDealerPill: true,
    showLocation: true,
    showYearLabel: true,
    showStatus: false,
    showAdminFlags: false,
  },
  carousel: {
    imgVariant: "card",
    imgWidth: 400,
    imgHeight: 300,
    aspectClass: "aspect-[4/3]",
    layout: "vertical",
    showFavorite: true,
    showMileageBadge: true,
    showDealerPill: true,
    showLocation: true,
    showYearLabel: true,
    showStatus: false,
    showAdminFlags: false,
  },
  horizontal: {
    imgVariant: "thumb",
    imgWidth: 160,
    imgHeight: 160,
    aspectClass: "aspect-square",
    layout: "horizontal",
    showFavorite: false,
    showMileageBadge: false,
    showDealerPill: false,
    showLocation: true,
    showYearLabel: true,
    showStatus: false,
    showAdminFlags: false,
  },
  related: {
    imgVariant: "card",
    imgWidth: 320,
    imgHeight: 240,
    aspectClass: "aspect-[4/3]",
    layout: "vertical",
    showFavorite: false,
    showMileageBadge: false,
    showDealerPill: true,
    showLocation: true,
    showYearLabel: true,
    showStatus: false,
    showAdminFlags: false,
  },
  dashboard: {
    imgVariant: "card",
    imgWidth: 320,
    imgHeight: 240,
    aspectClass: "aspect-[4/3]",
    layout: "vertical",
    showFavorite: false,
    showMileageBadge: true,
    showDealerPill: false,
    showLocation: false,
    showYearLabel: true,
    showStatus: true,
    showAdminFlags: false,
  },
  admin: {
    imgVariant: "thumb",
    imgWidth: 120,
    imgHeight: 90,
    aspectClass: "aspect-[4/3]",
    layout: "horizontal",
    showFavorite: false,
    showMileageBadge: false,
    showDealerPill: false,
    showLocation: false,
    showYearLabel: true,
    showStatus: true,
    showAdminFlags: true,
  },
};

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function parseNumber(value?: string | number | null): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value?: number | string | null): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(parseNumber(value));
}

function formatNumber(value?: number | string | null): string {
  return new Intl.NumberFormat("pt-BR").format(parseNumber(value));
}

function inferWeight(item: BaseAdData): 1 | 2 | 3 | 4 {
  if (item.catalogWeight) return item.catalogWeight;
  if (item.highlight_until) return 4;
  const plan = String(item.plan || "").toLowerCase();
  if (
    ["premium", "pro", "complete", "enterprise", "plus", "master"].some((signal) =>
      plan.includes(signal)
    )
  ) {
    return 3;
  }
  const isDealer = Boolean(
    item.dealership_id ||
      item.dealership_name ||
      item.dealer_name ||
      item.seller_type === "dealer" ||
      item.seller_type === "dealership" ||
      item.seller_type === "basic" ||
      item.seller_type === "premium"
  );
  if (isDealer) return 2;
  return 1;
}

function resolveBadge(
  item: BaseAdData
): { label: string; variant: "success" | "warning" | "info" | "premium" } | null {
  if (item.badge) {
    const label = String(item.badge);
    const lower = label.toLowerCase();
    if (lower.includes("abaixo")) return { label, variant: "success" };
    if (lower.includes("destaque")) return { label, variant: "warning" };
    if (lower.includes("premium")) return { label, variant: "premium" };
    return { label, variant: "info" };
  }
  if (item.below_fipe) return { label: "Abaixo da FIPE", variant: "success" };
  const weight = inferWeight(item);
  if (weight === 4) return { label: "Destaque", variant: "warning" };
  if (weight === 3) return { label: "Loja Premium", variant: "premium" };
  return null;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function resolveFavoriteKey(item: BaseAdData): string {
  if (item.slug && String(item.slug).trim()) return String(item.slug).trim();
  const fallback = [item.title, item.brand, item.model, item.year, item.id]
    .filter(Boolean)
    .join(" ");
  return slugify(fallback || `anuncio-${item.id ?? "sem-id"}`);
}

type NormalizedAd = {
  id?: string | number | null;
  slug: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: string | number | null;
  city: string;
  state: string;
  yearLabel: string;
  price: number;
  mileage: number;
  image: string;
  badge: { label: string; variant: "success" | "warning" | "info" | "premium" } | null;
  isDealer: boolean;
  dealerLabel: string;
};

function normalizeAdData(source?: BaseAdData): NormalizedAd {
  const item = source || {};
  const title =
    item.title ||
    [item.brand, item.model, item.version].filter(Boolean).join(" ").trim() ||
    "Veículo";
  return {
    id: item.id,
    slug: String(item.slug || "").trim(),
    title: String(title),
    brand: item.brand,
    model: item.model,
    version: item.version,
    year: item.year,
    city: String(item.city || "São Paulo"),
    state: String(item.state || "SP"),
    yearLabel: String(item.yearLabel || item.year_model || item.year || "").trim(),
    price: parseNumber(item.price),
    mileage: parseNumber(item.mileage),
    image: resolvePublicListingImageUrl({
      image: item.image,
      image_url: item.image_url,
      cover_image_url: item.cover_image_url,
      cover_image: item.cover_image,
      images: item.images,
      photos: item.photos,
      gallery: item.gallery,
      storage_key: item.storage_key,
    }),
    badge: resolveBadge(item),
    isDealer: isDealerListing(item),
    dealerLabel: dealerLabelFor(item),
  };
}

// ---------------------------------------------------------------------------
// Sub-componentes internos
// ---------------------------------------------------------------------------

type FavoriteButtonProps = {
  itemKey: string;
};

function FavoriteButton({ itemKey }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(itemKey);
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(itemKey);
    },
    [itemKey, toggleFavorite]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={fav}
      aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-cnc-danger shadow-card ring-1 ring-black/5 transition hover:scale-105"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill={fav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
      </svg>
    </button>
  );
}

function MileageBadge({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="currentColor">
        <circle cx="12" cy="12" r="9" opacity="0.3" />
        <path
          d="M12 12V6m0 6 4 2"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {formatNumber(value)} km
    </span>
  );
}

function DealerPill({ name }: { name: string }) {
  return (
    <span className="absolute bottom-2 right-2 z-10 inline-flex max-w-[55%] items-center gap-1 rounded-full bg-cnc-warning px-2 py-1 text-[11px] font-bold text-white shadow-card backdrop-blur-sm">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3 w-3 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      >
        <path
          d="M3 9l1.5-4h15L21 9M3 9v10a1 1 0 0 0 1 1h2v-7h12v7h2a1 1 0 0 0 1-1V9M3 9h18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="truncate">{name}</span>
    </span>
  );
}

function isDealerListing(item: BaseAdData): boolean {
  if (item.dealership_name && String(item.dealership_name).trim()) return true;
  if (item.dealer_name && String(item.dealer_name).trim()) return true;
  const sellerType = String(item.seller_type || "").toLowerCase();
  if (sellerType === "dealer" || sellerType === "dealership" || sellerType === "premium")
    return true;
  const plan = String(item.plan || "").toLowerCase();
  if (["premium", "pro", "plus", "master", "dealer"].some((token) => plan.includes(token)))
    return true;
  return false;
}

function dealerLabelFor(item: BaseAdData): string {
  const name = String(item.dealership_name || item.dealer_name || "").trim();
  if (name && name.length <= 18) return name;
  return "Loja parceira";
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  let variant: "success" | "warning" | "danger" | "info" = "info";
  if (lower.includes("ativo") || lower.includes("publicado")) variant = "success";
  else if (lower.includes("pausa")) variant = "warning";
  else if (lower.includes("rejeit") || lower.includes("bloqu") || lower.includes("expir"))
    variant = "danger";
  return <Badge variant={variant}>{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Layouts internos por variant
// ---------------------------------------------------------------------------

type LayoutProps = {
  normalized: NormalizedAd;
  config: VariantConfig;
  href: string;
  variant: AdCardVariant;
  priority: boolean;
  status?: string;
  flags?: ReadonlyArray<string>;
  actions?: ReactNode;
  favKey: string;
};

function VerticalLayout({
  normalized,
  config,
  href,
  variant,
  priority,
  status,
  actions,
  favKey,
}: LayoutProps) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-cnc-line bg-cnc-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-premium"
    >
      <div className={`relative ${config.aspectClass} overflow-hidden bg-cnc-bg`}>
        <VehicleImage
          src={normalized.image}
          alt={normalized.title}
          width={config.imgWidth}
          height={config.imgHeight}
          variant={config.imgVariant}
          priority={priority}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
        {config.showFavorite && <FavoriteButton itemKey={favKey} />}
        {config.showMileageBadge && <MileageBadge value={normalized.mileage} />}
        {config.showDealerPill && normalized.isDealer && (
          <DealerPill name={normalized.dealerLabel} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <div className="flex items-center gap-1.5">
          {normalized.badge && (
            <Badge variant={normalized.badge.variant} size="sm">
              {normalized.badge.label}
            </Badge>
          )}
          {config.showStatus && status && <StatusPill status={status} />}
        </div>

        <h3 className="line-clamp-2 min-h-[2.25rem] text-[14px] font-semibold leading-snug text-cnc-text-strong sm:text-[15px] md:text-base">
          {normalized.title}
        </h3>

        {config.showLocation && (
          <p className="text-[12px] text-cnc-muted sm:text-[13px]">
            {normalized.city} - {normalized.state}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <strong className="text-[16px] font-extrabold text-primary sm:text-[17px] md:text-[19px]">
            {formatCurrency(normalized.price)}
          </strong>
          {config.showYearLabel && normalized.yearLabel && (
            <span className="text-[11px] font-medium text-cnc-muted sm:text-xs">
              {normalized.yearLabel}
            </span>
          )}
        </div>

        {actions && <div className="pt-2">{actions}</div>}
      </div>
    </Link>
  );
}

function HorizontalLayout({
  normalized,
  config,
  href,
  variant,
  priority,
  status,
  flags,
  actions,
}: LayoutProps) {
  return (
    <Link
      href={href}
      className="group flex items-stretch gap-3 overflow-hidden rounded-lg border border-cnc-line bg-cnc-surface p-2 shadow-card transition hover:shadow-premium"
    >
      <div
        className={`relative ${config.aspectClass} shrink-0 overflow-hidden rounded-md bg-cnc-bg`}
        style={{ width: `${config.imgWidth}px` }}
      >
        <VehicleImage
          src={normalized.image}
          alt={normalized.title}
          width={config.imgWidth}
          height={config.imgHeight}
          variant={config.imgVariant}
          priority={priority}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {normalized.badge && (
            <Badge variant={normalized.badge.variant} size="sm">
              {normalized.badge.label}
            </Badge>
          )}
          {config.showStatus && status && <StatusPill status={status} />}
          {config.showAdminFlags &&
            flags?.map((flag) => (
              <Badge key={flag} variant="danger" size="sm">
                {flag}
              </Badge>
            ))}
        </div>

        <h3 className="line-clamp-1 text-sm font-semibold text-cnc-text-strong md:text-base">
          {normalized.title}
        </h3>

        {config.showYearLabel && normalized.yearLabel && (
          <span className="text-xs text-cnc-muted">{normalized.yearLabel}</span>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <strong className="text-base font-bold text-primary">
            {formatCurrency(normalized.price)}
          </strong>
          {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function AdCard({
  ad,
  item,
  variant = "carousel",
  priority = false,
  href,
  status,
  flags,
  actions,
  className = "",
}: AdCardProps) {
  const source = ad || item || {};
  const normalized = normalizeAdData(source);
  const config = VARIANTS[variant];
  const favKey = resolveFavoriteKey(source);

  const computedHref =
    href ??
    buildAdHref({
      id: normalized.id ?? undefined,
      slug: normalized.slug || undefined,
      title: normalized.title,
      brand: normalized.brand ?? undefined,
      model: normalized.model ?? undefined,
      version: normalized.version ?? undefined,
      year: normalized.year ?? undefined,
    });

  const layoutProps: LayoutProps = {
    normalized,
    config,
    href: computedHref,
    variant,
    priority,
    status,
    flags,
    actions,
    favKey,
  };

  return (
    <div className={className} data-variant={variant}>
      {config.layout === "horizontal" ? (
        <HorizontalLayout {...layoutProps} />
      ) : (
        <VerticalLayout {...layoutProps} />
      )}
    </div>
  );
}

export default AdCard;
