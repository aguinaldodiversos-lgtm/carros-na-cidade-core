import Link from "next/link";

import type { AdItem } from "@/lib/search/ads-search";
import { buildAdHref } from "@/lib/ads/build-ad-href";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";
import {
  primaryBadgeFromWeight,
  primaryBadgeLabel,
  VehicleBelowFipeBadge,
  VehiclePrimaryBadge,
} from "@/components/buy/VehicleBadge";
import CatalogVehicleCardImage from "@/components/buy/CatalogVehicleCardImage";

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
  cover_image_url?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  photos?: unknown;
  gallery?: unknown;
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
  priority?: boolean;
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
  if (!value) return "Sob consulta";

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

function formatMileageShort(value?: number | string | null) {
  const parsed = parseMileage(value);
  if (!parsed) return null;
  if (parsed >= 1000) {
    const k = parsed / 1000;
    const rounded = k >= 100 ? Math.round(k) : Number(k.toFixed(1));
    return `${rounded.toLocaleString("pt-BR")} mil km`;
  }
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
    cover_image_url: item.cover_image_url,
    cover_image: item.cover_image,
    images: item.images,
    photos: item.photos,
    gallery: item.gallery,
    storage_key: item.storage_key,
  });
}

function getTitle(item: CatalogItem) {
  const explicitTitle = toText(item.title);
  if (explicitTitle) return explicitTitle;

  const pieces = [toText(item.brand), toText(item.model)].filter(Boolean);
  return pieces.join(" ") || "Veículo";
}

function getSubtitle(item: CatalogItem) {
  const year = extractPrimaryYear(item);
  const pieces = [year, formatMileageShort(item.mileage), toText(item.transmission)].filter(
    Boolean
  );

  if (pieces.length > 0) return pieces.join(" · ");
  return "Informações sob consulta";
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

function getLocation(item: CatalogItem) {
  const city = toText(item.city, "São Paulo");
  const state = toText(item.state, "SP").toUpperCase();
  return `${city} - ${state}`;
}

export default function CatalogVehicleCard({
  item,
  featured = false,
  weight,
  linkMode = "self",
  hrefOverride,
  className = "",
  priority = false,
}: CatalogVehicleCardProps) {
  const title = getTitle(item);
  const href = hrefOverride || getHref(item, title);
  const price = parseMoney(item.price);
  const location = getLocation(item);
  const subtitle = getSubtitle(item);
  const primaryVariant = primaryBadgeFromWeight(weight);
  const image = getImage(item);
  const unoptimized =
    image.startsWith("/api/vehicle-images") ||
    image.startsWith("http") ||
    image.startsWith("data:") ||
    image.endsWith(".svg");

  const cardClasses = cx(
    "group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_3px_14px_-8px_rgba(15,23,42,0.15)] transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_30px_-18px_rgba(14,98,216,0.35)] sm:rounded-2xl",
    className
  );

  const sizes = featured
    ? "(min-width: 1024px) 50vw, 100vw"
    : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

  const content = (
    <>
      <div
        className={cx(
          "relative overflow-hidden bg-slate-100",
          featured ? "aspect-[16/10]" : "aspect-[16/11]"
        )}
      >
        <CatalogVehicleCardImage
          src={image}
          alt={title}
          sizes={sizes}
          unoptimized={unoptimized}
          priority={priority}
        />

        <div className="absolute left-2.5 top-2.5 z-[1] flex max-w-[calc(100%-3rem)] flex-col items-start gap-1 sm:left-3 sm:top-3 sm:gap-1.5">
          {item.below_fipe ? (
            <VehicleBelowFipeBadge />
          ) : (
            <VehiclePrimaryBadge variant={primaryVariant}>
              {primaryBadgeLabel(primaryVariant)}
            </VehiclePrimaryBadge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        <h3 className="line-clamp-1 text-[14.5px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[16px]">
          {title}
        </h3>

        <p className="mt-1 text-[12px] font-medium text-slate-500 sm:mt-1.5 sm:text-[13px]">
          {subtitle}
        </p>

        <p className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-500 sm:mt-2 sm:text-[12.5px]">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 text-slate-400 sm:h-3.5 sm:w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z" />
            <circle cx="12" cy="11" r="2.5" />
          </svg>
          <span className="truncate">{location}</span>
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3 sm:pt-4">
          <div className="text-[17px] font-extrabold leading-none tracking-tight text-blue-700 sm:text-[20px]">
            {formatCurrency(price)}
          </div>
          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-blue-700 transition group-hover:text-blue-800 sm:text-[13px]">
            Ver detalhes
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" aria-hidden>
              <path d="M7.5 4 13 10l-5.5 6-1.4-1.4L10.2 10 6.1 5.4Z" />
            </svg>
          </span>
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
