"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";

interface AdCardProps {
  item: AdItem;
  priority?: boolean;
  defaultFavorited?: boolean;
  onFavoriteToggle?: (id: number, favorited: boolean) => void;
}

interface BadgeConfig {
  label: string;
  className: string;
}

function formatPrice(price?: number) {
  if (!price || Number(price) <= 0) return "Consulte";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatMileage(value?: number): string | null {
  if (value == null || value <= 0) return null;
  return `${value.toLocaleString("pt-BR")} km`;
}

function resolveImage(item: AdItem) {
  if (item.image_url) return item.image_url;
  if (Array.isArray(item.images) && item.images.length > 0) return item.images[0];
  return "/images/hero.jpeg";
}

function resolveAdHref(item: AdItem) {
  if (item.slug) return `/veiculo/${item.slug}`;
  return `/anuncios/${item.id}`;
}

function buildTitle(item: AdItem) {
  if (item.title?.trim()) return item.title.trim();
  return [item.year, item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
}

function getBadges(item: AdItem): BadgeConfig[] {
  const badges: BadgeConfig[] = [];
  if (item.highlight_until) {
    badges.push({ label: "Destaque", className: "bg-[#0a7c83] text-white" });
  }
  if (item.below_fipe) {
    badges.push({ label: "Abaixo da FIPE", className: "bg-[#0e62d8] text-white" });
  }
  if (item.imported) {
    badges.push({ label: "Importado", className: "bg-[#7c3aed] text-white" });
  }
  if (item.certified) {
    badges.push({ label: "Certificado", className: "bg-[#0d9488] text-white" });
  }
  if (item.sinistro) {
    badges.push({ label: "Sinistrado", className: "bg-[#dc2626] text-white" });
  }
  return badges;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 transition-transform duration-200"
      fill={filled ? "#e43358" : "white"}
      stroke={filled ? "#e43358" : "rgba(0,0,0,0.15)"}
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

export function AdCard({
  item,
  priority = false,
  defaultFavorited = false,
  onFavoriteToggle,
}: AdCardProps) {
  const [favorited, setFavorited] = useState(defaultFavorited);
  const [imgSrc, setImgSrc] = useState(() => resolveImage(item));

  const href = resolveAdHref(item);
  const title = buildTitle(item);
  const location = [item.city, item.state].filter(Boolean).join(" - ");
  const badges = getBadges(item);
  const mileage = formatMileage(item.mileage);

  const handleFavorite = useCallback(() => {
    const next = !favorited;
    setFavorited(next);
    onFavoriteToggle?.(item.id, next);
  }, [favorited, item.id, onFavoriteToggle]);

  const handleImgError = useCallback(() => {
    setImgSrc("/images/hero.jpeg");
  }, []);

  return (
    <article
      className="overflow-hidden rounded-[22px] border border-[#e1e7f0] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.12)]"
      itemScope
      itemType="https://schema.org/Car"
      data-ad-id={item.id}
      data-testid="ad-card"
    >
      {/* Image section – button is a sibling of Link to avoid nesting interactive elements */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[#edf2f8]">
        <Link href={href} className="group absolute inset-0 block" tabIndex={-1} aria-hidden="true">
          <Image
            src={imgSrc}
            alt={title}
            fill
            priority={priority}
            loading={priority ? undefined : "lazy"}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={handleImgError}
            itemProp="image"
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent" />
        </Link>

        {badges.length > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded-lg px-3 py-1 text-[11px] font-bold shadow-sm ${badge.className}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleFavorite}
          aria-label={
            favorited
              ? `Remover ${title} dos favoritos`
              : `Adicionar ${title} aos favoritos`
          }
          aria-pressed={favorited}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition-transform duration-150 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-1"
        >
          <HeartIcon filled={favorited} />
        </button>
      </div>

      <div className="p-4">
        <h3 className="line-clamp-2 text-[17px] font-extrabold leading-6 text-[#1d2538]" itemProp="name">
          <Link
            href={href}
            className="transition-colors duration-150 hover:text-[#0e62d8] focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#0e62d8]"
          >
            {title}
          </Link>
        </h3>

        <div className="mt-1 text-sm text-[#6b7488]" itemProp="vehicleLocation">
          {location || "Localização não informada"}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[14px] text-[#616b80]">
          {item.year ? (
            <span itemProp="vehicleModelDate">{item.year}</span>
          ) : null}
          {mileage ? (
            <span>
              <span aria-hidden="true">• </span>
              <span itemProp="mileageFromOdometer">{mileage}</span>
            </span>
          ) : null}
          {item.plan ? <span>• {item.plan}</span> : null}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div
              className="text-[18px] font-black tracking-tight text-[#0e62d8] md:text-[20px]"
              itemProp="price"
              content={item.price?.toString()}
            >
              {formatPrice(item.price)}
            </div>
            {item.price && item.price > 0 ? (
              <meta itemProp="priceCurrency" content="BRL" />
            ) : null}
          </div>

          {item.below_fipe ? (
            <span className="rounded-md bg-[#eef5ff] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0e62d8]">
              Oferta
            </span>
          ) : null}
        </div>

        <Link
          href={href}
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-[17px] font-bold text-white transition hover:bg-[#0c4fb0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-2"
          aria-label={`Ver detalhes de ${title}`}
        >
          Ver detalhes
        </Link>
      </div>
    </article>
  );
}
