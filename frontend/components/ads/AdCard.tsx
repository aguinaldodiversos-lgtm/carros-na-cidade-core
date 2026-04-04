"use client";

import Link from "next/link";
import { buildAdHref } from "@/lib/ads/build-ad-href";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";

type BaseAdData = {
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
  cover_image?: string | null;
  images?: string[] | null;
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

type AdCardProps = {
  ad?: BaseAdData;
  item?: BaseAdData;
  priority?: boolean;
  variant?: "default" | "home" | string;
};

function parseNumber(value?: string | number | null) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value?: number | string | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(parseNumber(value));
}

function formatNumber(value?: number | string | null) {
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

function resolveBadge(item: BaseAdData) {
  if (item.badge) return String(item.badge);
  if (item.below_fipe) return "Abaixo da FIPE";

  const weight = inferWeight(item);
  if (weight === 4) return "Destaque";
  if (weight === 3) return "Loja Premium";

  return undefined;
}

function badgeClasses(label?: string) {
  const normalized = String(label || "").toLowerCase();

  if (normalized.includes("abaixo")) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (normalized.includes("destaque")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (normalized.includes("premium")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function normalizeAdData(source?: BaseAdData): {
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
  badge?: string;
} {
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
      cover_image: item.cover_image,
      images: item.images,
    }),
    badge: resolveBadge(item),
  };
}

export function AdCard({ ad, item }: AdCardProps) {
  const source = ad || item || {};
  const normalized = normalizeAdData(source);

  const href = buildAdHref({
    id: normalized.id ?? undefined,
    slug: normalized.slug || undefined,
    title: normalized.title,
    brand: normalized.brand ?? undefined,
    model: normalized.model ?? undefined,
    version: normalized.version ?? undefined,
    year: normalized.year ?? undefined,
  });

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-[24px] border border-[#E5E9F2] bg-white shadow-[0_12px_30px_rgba(30,41,59,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(30,41,59,0.10)]"
    >
      <div className="aspect-[16/10] overflow-hidden bg-[#EDF2FB]">
        <img
          src={normalized.image}
          alt={normalized.title || "Veículo"}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      </div>

      <div className="space-y-2 p-4">
        {normalized.badge ? (
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(
              normalized.badge
            )}`}
          >
            {normalized.badge}
          </span>
        ) : null}

        <h3 className="line-clamp-2 min-h-[44px] text-[18px] font-semibold leading-6 text-[#1D2440]">
          {normalized.title}
        </h3>

        <p className="text-sm text-[#6E748A]">
          {normalized.city} - {normalized.state}
        </p>

        <div className="flex items-center justify-between gap-3 pt-1">
          <strong className="text-[20px] font-extrabold text-[#1F66E5]">
            {formatCurrency(normalized.price)}
          </strong>
          <span className="text-xs font-medium text-[#6E748A]">{normalized.yearLabel}</span>
        </div>

        {!!normalized.mileage && (
          <div className="text-xs text-[#6E748A]">{formatNumber(normalized.mileage)} km</div>
        )}
      </div>
    </Link>
  );
}

export default AdCard;
