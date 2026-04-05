"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { isFavoriteSlug, toggleFavoriteSlug } from "@/lib/favorites/local-favorites";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";

type VehicleItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  year?: number | string;
  mileage?: number | string;
  city?: string;
  state?: string;
  price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  image?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
};

interface HomeVehicleCardProps {
  item: VehicleItem;
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

function buildTitle(item: VehicleItem) {
  if (item.title) return item.title;
  return [item.year, item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
}

function resolveImage(item: VehicleItem) {
  return resolvePublicListingImageUrl({
    image_url: item.image_url,
    image: item.image,
    cover_image: item.cover_image,
    images: item.images,
  });
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

function resolveFavoriteKey(item: VehicleItem) {
  if (item.slug && String(item.slug).trim()) return String(item.slug).trim();
  const fallback = [item.title, item.brand, item.model, item.year, item.id]
    .filter(Boolean)
    .join(" ");
  return slugify(fallback || `anuncio-${item.id}`);
}

function resolveHref(item: VehicleItem) {
  if (item.slug) return `/veiculo/${encodeURIComponent(item.slug)}`;

  const fallback = [item.title, item.brand, item.model, item.year, item.id]
    .filter(Boolean)
    .join(" ");

  return `/veiculo/${slugify(fallback || `anuncio-${item.id}`)}`;
}

function discountLabel(item: VehicleItem, variant: "highlight" | "opportunity") {
  if (variant === "opportunity" || item.below_fipe) {
    return "Abaixo da tabela";
  }
  if (item.highlight_until) return "Patrocinado";
  return "Destaque";
}

export function HomeVehicleCard({ item, variant }: HomeVehicleCardProps) {
  const title = buildTitle(item);
  const image = resolveImage(item);
  const href = resolveHref(item);
  const mileage = formatMileage(item.mileage);
  const cityLabel = [item.city || "São Paulo", item.state || "SP"].join(" - ");
  const favKey = resolveFavoriteKey(item);
  const [fav, setFav] = useState(() => isFavoriteSlug(favKey));

  const badgeTop = useMemo(() => {
    if (variant === "highlight") return "Patrocinado";
    return "Oportunidade";
  }, [variant]);

  const priceExtra = useMemo(() => {
    if (variant === "opportunity" || item.below_fipe) {
      return "ABAIXO DA TABELA";
    }
    return null;
  }, [item.below_fipe, variant]);

  const onToggleFav = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setFav(toggleFavoriteSlug(favKey));
    },
    [favKey]
  );

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-[14px] border border-[#e1e6f0] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.11)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#f1f4f9]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/vehicle-placeholder.svg"; }}
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5 sm:p-3">
          <span className="inline-flex rounded-lg bg-[#0e62d8] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-sm sm:text-[12px]">
            {badgeTop}
          </span>

          <button
            type="button"
            onClick={onToggleFav}
            aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            aria-pressed={fav}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#e11d48] shadow-md ring-1 ring-black/5 transition hover:scale-105"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[16px] w-[16px]"
              fill={fav ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-3 pb-4 pt-3 sm:px-4">
        <h3 className="line-clamp-2 text-[16px] font-extrabold leading-[1.25] text-[#1c263a] sm:text-[17px]">
          {title}
        </h3>

        <p className="mt-1.5 text-[14px] text-[#6e778a]">{cityLabel}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-extrabold text-[#0e62d8] sm:text-[18px]">
            {formatPrice(item.price)}
          </span>
          {priceExtra ? (
            <span className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0e62d8] sm:text-[11px]">
              {priceExtra}
            </span>
          ) : (
            <span className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-[10px] font-bold text-[#0e62d8] sm:text-[11px]">
              {discountLabel(item, variant)}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-[12px] text-[#7b8497] sm:text-[13px]">
          <span>{mileage || "—"}</span>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#f2f5fa] text-[#46536f] transition group-hover:bg-[#0e62d8] group-hover:text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
