import Link from "next/link";

import type { AdItem } from "@/lib/search/ads-search";
import { buildAdHref } from "@/lib/ads/build-ad-href";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";
import { VehicleCardImage } from "@/components/buy/VehicleCardImage";
import {
  financeChipLabel,
  primaryBadgeFromWeight,
  primaryBadgeLabel,
  VehicleBelowFipeBadge,
  VehicleFinanceChip,
  VehiclePrimaryBadge,
} from "@/components/buy/VehicleBadge";

export type CatalogItem = AdItem & {
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: number | string;
  year_model?: string | null;
  yearLabel?: string | null;
  mileage?: number | string;
  transmission?: string | null;
  fuel_type?: string | null;
  body_type?: string | null;
  city?: string;
  state?: string;
  price?: number | string;
  image_url?: string | null;
  image?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  slug?: string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  plan?: string | null;
  seller_type?: string | null;
  dealer_name?: string | null;
  dealership_name?: string | null;
  dealership_id?: number | null;
  created_at?: string | null;
  catalogWeight?: 1 | 2 | 3 | 4;
};

interface CatalogVehicleCardProps {
  item: CatalogItem;
  featured?: boolean;
  weight: 1 | 2 | 3 | 4;
  linkMode?: "self" | "none";
  hrefOverride?: string;
  className?: string;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toText(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  if (!value) return "R$ 0";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseMileage(value?: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const cleaned = String(value).replace(/[^\d]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMileage(value?: number | string | null) {
  const parsed = parseMileage(value);
  if (!parsed) return null;
  return `${parsed.toLocaleString("pt-BR")} km`;
}

function extractPrimaryYear(item: CatalogItem) {
  const candidates = [item.year, item.yearLabel, item.year_model];

  for (const candidate of candidates) {
    const text = toText(candidate);
    if (!text) continue;

    const match = text.match(/\d{4}/);
    if (match) return match[0];
  }

  return "";
}

function getImage(item: CatalogItem) {
  return resolvePublicListingImageUrl({
    image_url: item.image_url,
    image: item.image,
    cover_image: item.cover_image,
    images: item.images,
  });
}

function getTitle(item: CatalogItem) {
  const explicitTitle = toText(item.title);
  if (explicitTitle) return explicitTitle;

  const year = extractPrimaryYear(item);
  const pieces = [year, toText(item.brand), toText(item.model), toText(item.version)].filter(
    Boolean
  );

  return pieces.join(" ") || "Veículo";
}

function getHref(item: CatalogItem, resolvedTitle: string) {
  return buildAdHref({
    id: item.id,
    slug: item.slug || undefined,
    title: resolvedTitle,
    brand: item.brand || undefined,
    model: item.model || undefined,
    version: item.version || undefined,
    year: item.year || item.year_model || item.yearLabel || undefined,
  });
}

function getMetaLine(item: CatalogItem) {
  const pieces = [
    toText(item.fuel_type),
    formatMileage(item.mileage),
    toText(item.transmission),
  ].filter(Boolean);

  if (pieces.length > 0) return pieces.join("  ·  ");
  return "Informações sob consulta";
}

function getLocation(item: CatalogItem) {
  const city = toText(item.city, "São Paulo");
  const state = toText(item.state, "SP").toUpperCase();
  return `${city} - ${state}`;
}

function getListedHint(createdAt?: string | null) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return null;

  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);

  if (days < 1) return "Publicado hoje";
  if (days === 1) return "Publicado há 1 dia";
  if (days < 7) return `Publicado há ${days} dias`;
  if (days < 30) return `Publicado há ${Math.floor(days / 7)} semanas`;
  return `Desde ${d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
}

export default function CatalogVehicleCard({
  item,
  featured = false,
  weight,
  linkMode = "self",
  hrefOverride,
  className = "",
}: CatalogVehicleCardProps) {
  const title = getTitle(item);
  const href = hrefOverride || getHref(item, title);
  const price = parseMoney(item.price);
  const location = getLocation(item);
  const meta = getMetaLine(item);
  const primaryVariant = primaryBadgeFromWeight(weight);
  const financeLabel = financeChipLabel(weight, Boolean(item.below_fipe));
  const image = getImage(item);
  const listedHint = getListedHint(item.created_at);

  const cardClasses = cx(
    "group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-16px_rgba(15,23,42,0.18)]",
    featured ? "ring-1 ring-slate-200/60" : "",
    className
  );

  const content = (
    <>
      <div
        className={cx(
          "relative overflow-hidden bg-slate-100",
          featured ? "aspect-[16/10]" : "aspect-[4/3]"
        )}
      >
        <VehicleCardImage
          src={image}
          alt={title}
          featured={featured}
          className="object-cover transition duration-500 group-hover:scale-[1.04]"
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/25 via-transparent to-slate-900/10" />

        <div className="absolute left-3 top-3 z-[1] flex max-w-[calc(100%-4rem)] flex-col items-start gap-1.5">
          <VehiclePrimaryBadge variant={primaryVariant}>
            {primaryBadgeLabel(primaryVariant)}
          </VehiclePrimaryBadge>
          {item.below_fipe ? <VehicleBelowFipeBadge /> : null}
        </div>

        <span
          aria-hidden="true"
          className="absolute right-3 top-3 z-[1] inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-400 shadow-md ring-1 ring-white/80 backdrop-blur-sm"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[17px] w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
          </svg>
        </span>
      </div>

      <div className={cx("flex flex-1 flex-col px-4 pb-4 pt-4", featured && "md:px-5 md:pb-5 md:pt-5")}>
        <h3
          className={cx(
            "line-clamp-2 min-h-[2.75rem] font-bold leading-snug tracking-tight text-slate-900",
            featured ? "text-lg md:text-xl" : "text-[15px] md:text-base"
          )}
        >
          {title}
        </h3>

        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-slate-600">{meta}</p>
        <p className="mt-1 text-[13px] font-medium text-slate-500">{location}</p>
        {listedHint ? (
          <p className="mt-1 text-[12px] font-medium text-slate-400">{listedHint}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-4">
          <div
            className={cx(
              "font-extrabold leading-none tracking-tight text-blue-700",
              featured ? "text-2xl" : "text-xl"
            )}
          >
            {formatCurrency(price)}
          </div>
          <VehicleFinanceChip>{financeLabel}</VehicleFinanceChip>
        </div>

        <div
          className={cx(
            "mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-700 text-center text-sm font-semibold text-white transition group-hover:bg-blue-800",
            featured ? "min-h-[3rem] text-base" : "min-h-[2.75rem]"
          )}
        >
          Ver detalhes
        </div>
      </div>
    </>
  );

  if (linkMode === "none") {
    return <article className={cardClasses}>{content}</article>;
  }

  return (
    <article className={cardClasses}>
      <Link href={href} className="flex h-full flex-col" aria-label={`Ver detalhes de ${title}`}>
        {content}
      </Link>
    </article>
  );
}
