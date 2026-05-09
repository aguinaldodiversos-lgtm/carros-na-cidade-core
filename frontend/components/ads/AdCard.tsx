// frontend/components/ads/AdCard.tsx
"use client";

import Link from "next/link";
import { useCallback, type ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { VehicleImage } from "@/components/ui/VehicleImage";
import { buildAdHref } from "@/lib/ads/build-ad-href";
import { useFavorites } from "@/lib/favorites/FavoritesContext";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";
import { resolveSellerKind } from "@/lib/vehicle/seller-kind";

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
  /** Compat: backend agora envia `seller_kind` ('dealer'|'private'). */
  seller_type?: string | null;
  /** Fonte canônica do tipo de anunciante (backend trust pass). */
  seller_kind?: string | null;
  /** users.document_type (CPF|CNPJ) — fallback do mapper único. */
  account_type?: string | null;
  /**
   * Backend computa após moderação aprovar anúncio com sinal de
   * preço abaixo da FIPE. Se true, AdCard mostra selo "Anúncio analisado".
   */
  reviewed_after_below_fipe?: boolean | null;
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

type BadgeChip = {
  label: string;
  variant: "success" | "warning" | "info" | "premium" | "reviewed";
};

function resolveBadge(item: BaseAdData): BadgeChip | null {
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

/**
 * Combina sinais "destaque", "abaixo da FIPE" e "anúncio analisado" em
 * até 3 chips coloridos lado a lado. Ordem fixa: destaque (warning),
 * abaixo-da-fipe (success), anúncio analisado (reviewed).
 *
 * "Anúncio analisado" SÓ aparece quando o backend marcou
 * `reviewed_after_below_fipe` (anúncio entrou em pending_review por sinal
 * de preço abaixo da FIPE e foi aprovado pela moderação). Frontend
 * NUNCA infere este selo a partir de outras heurísticas — risco de
 * passar mensagem de "garantia" indevidamente.
 */
function resolveBadges(item: BaseAdData): BadgeChip[] {
  const out: BadgeChip[] = [];
  const weight = inferWeight(item);
  if (weight === 4) out.push({ label: "OFERTA DESTAQUE", variant: "warning" });
  else if (weight === 3) out.push({ label: "LOJA PREMIUM", variant: "premium" });
  if (item.below_fipe) out.push({ label: "ABAIXO DA FIPE", variant: "success" });
  if (item.reviewed_after_below_fipe === true) {
    out.push({ label: "ANÚNCIO ANALISADO", variant: "reviewed" });
  }
  // Se o backend mandou um item.badge custom e ainda não temos nada, usa.
  if (out.length === 0 && item.badge) {
    const single = resolveBadge(item);
    if (single) out.push({ ...single, label: single.label.toUpperCase() });
  }
  return out;
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
  badge: BadgeChip | null;
  badges: BadgeChip[];
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
    badges: resolveBadges(item),
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
  // Fonte única: o mapper canônico em lib/vehicle/seller-kind.ts.
  // Antes, esta função inferia "loja" também por `dealership_name` ou
  // `plan` premium — heurística que classificava errado casos como
  // particulares com plano premium ativo. Agora delegamos ao mapper
  // que prioriza dealership_id (loja registrada) e document_type CNPJ.
  return resolveSellerKind(item) === "dealer";
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
  // Brand+modelo separados para hierarquia tipo Webmotors. Fallback no
  // title já normalizado quando brand/model não vieram do backend.
  const brandLabel = (normalized.brand || "").trim().toUpperCase();
  const modelLabel = (normalized.model || "").trim();
  const headTitle = brandLabel
    ? modelLabel
      ? `${brandLabel} ${modelLabel}`
      : brandLabel
    : normalized.title;
  const versionLabel = (normalized.version || "").trim();
  const showVersion = versionLabel && versionLabel.toLowerCase() !== modelLabel.toLowerCase();

  // Variantes "showcase" (públicas) ganham o footer com CTA "Ver parcelas".
  // dashboard/admin usam o slot `actions` que vem de fora.
  const isShowcase =
    variant === "grid" || variant === "carousel" || variant === "featured" || variant === "compact";

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-cnc-line bg-cnc-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-premium"
    >
      {/*
        Container da foto: bg neutro e object-contain — preserva proporção
        original do veículo (não corta SUVs/sedans wide), padrão Webmotors.
      */}
      <div className={`relative ${config.aspectClass} overflow-hidden bg-[#f4f5f7]`}>
        <VehicleImage
          src={normalized.image}
          alt={normalized.title}
          width={config.imgWidth}
          height={config.imgHeight}
          variant={config.imgVariant}
          priority={priority}
          className="h-full w-full object-contain p-1.5 transition duration-300 group-hover:scale-[1.02] sm:p-2"
        />
        {config.showFavorite && <FavoriteButton itemKey={favKey} />}
        {/*
          Mileage não é mais badge sobre a foto — desce pra linha de
          specs. DealerPill mantida (sinaliza loja parceira no rodapé da
          foto).
        */}
        {config.showDealerPill && normalized.isDealer && (
          <DealerPill name={normalized.dealerLabel} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
        {/*
          Linha de badges SEMPRE reservada com min-h fixo — assim cards
          sem destaque/fipe não sobem o footer (CTAs alinhados em grid).
          OFERTA DESTAQUE (warning) + ABAIXO DA FIPE (success) em até 2 chips.
        */}
        <div className="flex min-h-[1.25rem] flex-wrap items-center gap-1.5">
          {normalized.badges.map((b) => (
            <BadgeChipPill key={b.label} chip={b} />
          ))}
          {config.showStatus && status && <StatusPill status={status} />}
        </div>

        {/* Título: BRAND uppercase + Modelo */}
        <h3 className="line-clamp-1 text-[14px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[15px]">
          {headTitle}
        </h3>

        {/*
          Subtítulo: versão/trim (line-clamp 2). Sempre reservamos
          min-h-2rem mesmo quando o veículo não tem versão — mantém os
          cards alinhados em grid.
        */}
        {showVersion ? (
          <p className="line-clamp-2 min-h-[2rem] text-[12px] leading-snug text-cnc-muted sm:text-[12.5px]">
            {versionLabel}
          </p>
        ) : (
          <p className="min-h-[2rem]" aria-hidden="true" />
        )}

        {/* Specs row: ano + km com ícones */}
        <SpecRow yearLabel={normalized.yearLabel} mileage={normalized.mileage} />

        {/* Localização com pin */}
        {config.showLocation && (
          <p className="inline-flex items-center gap-1 text-[12px] text-cnc-muted sm:text-[12.5px]">
            <PinIcon />
            {normalized.city} ({normalized.state})
          </p>
        )}

        {/*
          Footer wrapper com `mt-auto` — empurra preço + CTA pra base do
          card mesmo quando o conteúdo acima varia. Garante o alinhamento
          horizontal dos botões entre cards do mesmo grid row.
        */}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <strong className="text-[18px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[20px]">
            {formatCurrency(normalized.price)}
          </strong>

          {actions ? (
            <div>{actions}</div>
          ) : isShowcase ? (
            <span className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-cnc-footer-a text-[12.5px] font-bold text-white shadow-sm transition group-hover:bg-cnc-footer-b sm:h-10 sm:text-[13.5px]">
              Ver Detalhes
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/**
 * Chip colorido estilo "OFERTA DESTAQUE" / "ABAIXO DA FIPE" do Webmotors.
 * Mais denso e tipográfico que o Badge genérico (uppercase + tracking +
 * cores do DS).
 */
function BadgeChipPill({ chip }: { chip: BadgeChip }) {
  const palette: Record<BadgeChip["variant"], string> = {
    success: "bg-cnc-success/12 text-cnc-success ring-cnc-success/35",
    warning: "bg-cnc-warning/15 text-cnc-warning ring-cnc-warning/40",
    info: "bg-primary-soft text-primary ring-primary/30",
    premium: "bg-violet-100 text-violet-700 ring-violet-300/60",
    // Selo "ANÚNCIO ANALISADO" — sóbrio, sem cor de "garantia". Slate
    // claro com tipografia do DS evita conotação de "verificado pelo
    // governo" / "compra segura garantida". Comunica REVISÃO, não
    // garantia.
    reviewed: "bg-slate-100 text-slate-700 ring-slate-300/70",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ring-1 ring-inset ${palette[chip.variant]}`}
      title={
        chip.variant === "reviewed"
          ? "Este anúncio passou por revisão antes de ser exibido."
          : undefined
      }
    >
      {chip.label}
    </span>
  );
}

function SpecRow({ yearLabel, mileage }: { yearLabel: string; mileage: number }) {
  const hasYear = yearLabel && yearLabel.trim().length > 0;
  const hasMileage = mileage > 0;
  if (!hasYear && !hasMileage) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-cnc-muted sm:text-[12.5px]">
      {hasYear ? (
        <span className="inline-flex items-center gap-1">
          <CalendarIcon />
          <span className="tabular-nums">{yearLabel}</span>
        </span>
      ) : null}
      {hasMileage ? (
        <span className="inline-flex items-center gap-1">
          <GaugeIcon />
          <span className="tabular-nums">{formatNumber(mileage)} km</span>
        </span>
      ) : null}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 14a8 8 0 1 0-8 0" />
      <path d="m13.5 10.5-3 3" />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
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
