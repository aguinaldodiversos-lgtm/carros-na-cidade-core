import Link from "next/link";

import { IconPin } from "@/components/home/icons";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";
import { VehicleFavoriteButton } from "./VehicleFavoriteButton";

export type VehicleCardItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: number | string;
  mileage?: number | string;
  transmission?: string | null;
  city?: string;
  state?: string;
  price?: number | string;
  fipe_price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  image?: string | null;
  cover_image_url?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  photos?: unknown;
  gallery?: unknown;
};

interface VehicleCardProps {
  item: VehicleCardItem;
  variant: "highlight" | "opportunity";
}

function parseNumber(value?: number | string) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value?: number | string) {
  const numeric = parseNumber(value);
  if (!numeric) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatMileage(value?: number | string) {
  const numeric = parseNumber(value);
  if (!numeric) return null;
  return `${numeric.toLocaleString("pt-BR")} km`;
}

function buildTitle(item: VehicleCardItem) {
  if (item.title) return item.title;
  return [item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
}

function buildVersion(item: VehicleCardItem) {
  return item.version || "";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function resolveFavoriteKey(item: VehicleCardItem) {
  if (item.slug && String(item.slug).trim()) return String(item.slug).trim();
  const fallback = [item.title, item.brand, item.model, item.year, item.id]
    .filter(Boolean)
    .join(" ");
  return slugify(fallback || `anuncio-${item.id}`);
}

function resolveHref(item: VehicleCardItem) {
  if (item.slug) return `/veiculo/${encodeURIComponent(item.slug)}`;
  const fallback = [item.title, item.brand, item.model, item.year, item.id]
    .filter(Boolean)
    .join(" ");
  return `/veiculo/${slugify(fallback || `anuncio-${item.id}`)}`;
}

function computeFipeDiscount(price?: number | string, fipe?: number | string) {
  const p = parseNumber(price);
  const f = parseNumber(fipe);
  if (!p || !f || f <= p) return null;
  const pct = Math.round(((f - p) / f) * 100);
  if (pct <= 0) return null;
  return pct;
}

export function VehicleCard({ item, variant }: VehicleCardProps) {
  const title = buildTitle(item);
  const version = buildVersion(item);
  const href = resolveHref(item);
  const mileage = formatMileage(item.mileage);
  const image = resolvePublicListingImageUrl({
    image_url: item.image_url,
    image: item.image,
    cover_image_url: item.cover_image_url,
    cover_image: item.cover_image,
    images: item.images,
    photos: item.photos,
    gallery: item.gallery,
  });
  const favKey = resolveFavoriteKey(item);

  const year = item.year ? String(item.year) : null;
  const transmission = item.transmission || null;
  const location = [item.city, item.state].filter(Boolean).join(" · ");

  const fipeDiscount = computeFipeDiscount(item.price, item.fipe_price);
  const isOpportunity = variant === "opportunity";
  const topBadge = isOpportunity
    ? fipeDiscount
      ? `-${fipeDiscount}% da FIPE`
      : "Abaixo da FIPE"
    : "Patrocinado";

  return (
    <Link
      href={href}
      className="group flex min-w-[240px] flex-col overflow-hidden rounded-[12px] border border-[#e7e8f1] bg-white shadow-[0_4px_14px_rgba(15,10,40,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(15,10,40,0.10)] sm:min-w-[280px] sm:rounded-[14px]"
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-[#eef0f6]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />

        <span
          className={`absolute left-2 top-2 inline-flex items-center rounded-[7px] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm sm:left-2.5 sm:top-2.5 sm:rounded-[8px] sm:px-2 sm:py-1 sm:text-[11px] ${
            isOpportunity ? "bg-[#059669]" : "bg-[#2d3a9c]"
          }`}
        >
          {topBadge}
        </span>

        <VehicleFavoriteButton favKey={favKey} />
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
        <h3 className="line-clamp-1 text-[14px] font-extrabold leading-tight text-[#1a1f36] sm:text-[15px]">
          {title}
        </h3>
        {version ? (
          <p className="mt-0.5 line-clamp-1 text-[12px] text-[#5b6079] sm:text-[12.5px]">
            {version}
          </p>
        ) : null}

        <p className="mt-1 line-clamp-1 text-[12px] text-[#5b6079] sm:mt-1.5 sm:text-[12.5px]">
          {[year, mileage, transmission].filter(Boolean).join(" · ")}
        </p>

        {location ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#5b6079] sm:mt-1.5 sm:text-[12.5px]">
            <IconPin className="h-3 w-3 text-[#2d3a9c] sm:h-3.5 sm:w-3.5" />
            {location}
          </p>
        ) : null}

        <div className="mt-2.5 flex items-end justify-between sm:mt-3">
          <span className="text-[16px] font-extrabold text-[#1a1f36] sm:text-[18px]">
            {formatPrice(item.price)}
          </span>
          {isOpportunity && item.fipe_price ? (
            <span className="inline-flex items-center rounded-[6px] bg-[#d1fae5] px-1.5 py-0.5 text-[10px] font-bold text-[#047857] sm:px-2 sm:py-1 sm:text-[11px]">
              FIPE {formatPrice(item.fipe_price)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
