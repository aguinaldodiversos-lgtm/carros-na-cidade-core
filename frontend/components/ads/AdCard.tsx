"use client";

import Link from "next/link";
import { buildAdHref } from "@/lib/ads/build-ad-href";

type AdCardProps = {
  ad: {
    id?: string | number;
    slug?: string;
    title: string;
    brand?: string;
    model?: string;
    version?: string;
    year?: string | number;
    city?: string;
    state?: string;
    price?: number;
    mileage?: number;
    yearLabel?: string;
    image?: string;
    badge?: string;
  };
};

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value?: number) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
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

export default function AdCard({ ad }: AdCardProps) {
  const href = buildAdHref(ad);

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-[24px] border border-[#E5E9F2] bg-white shadow-[0_12px_30px_rgba(30,41,59,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(30,41,59,0.10)]"
    >
      <div className="aspect-[16/10] overflow-hidden bg-[#EDF2FB]">
        <img
          src={ad.image || "/placeholder-car.jpg"}
          alt={ad.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      </div>

      <div className="space-y-2 p-4">
        {ad.badge ? (
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(
              ad.badge
            )}`}
          >
            {ad.badge}
          </span>
        ) : null}

        <h3 className="line-clamp-2 min-h-[44px] text-[18px] font-semibold leading-6 text-[#1D2440]">
          {ad.title}
        </h3>

        <p className="text-sm text-[#6E748A]">
          {ad.city || "São Paulo"} - {ad.state || "SP"}
        </p>

        <div className="flex items-center justify-between gap-3 pt-1">
          <strong className="text-[20px] font-extrabold text-[#1F66E5]">
            {formatCurrency(ad.price)}
          </strong>
          <span className="text-xs font-medium text-[#6E748A]">
            {ad.yearLabel || `${ad.year || ""}`}
          </span>
        </div>

        {!!ad.mileage && (
          <div className="text-xs text-[#6E748A]">
            {formatNumber(ad.mileage)} km
          </div>
        )}
      </div>
    </Link>
  );
}
