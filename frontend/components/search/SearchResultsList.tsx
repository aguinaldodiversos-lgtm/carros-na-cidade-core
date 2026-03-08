"use client";

import Link from "next/link";
import type { AdItem } from "../../lib/search/ads-search";

interface SearchResultsListProps {
  items: AdItem[];
}

function formatPrice(price?: number) {
  if (!price) return "Consulte";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatMileage(value?: number) {
  if (!value) return "Km não informado";
  return `${value.toLocaleString("pt-BR")} km`;
}

function resolveAdPath(item: AdItem) {
  return item.slug ? `/anuncios/${item.slug}` : `/anuncios/${item.id}`;
}

export function SearchResultsList({ items }: SearchResultsListProps) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
        <h3 className="text-lg font-semibold text-zinc-900">
          Nenhum anúncio encontrado
        </h3>
        <p className="mt-2 text-sm text-zinc-500">
          Ajuste os filtros ou tente outra combinação de busca.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={resolveAdPath(item)}
          className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="aspect-[16/10] w-full bg-zinc-100" />

          <div className="p-4">
            <div className="mb-2 flex flex-wrap gap-2">
              {item.below_fipe === true && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Abaixo da FIPE
                </span>
              )}

              {item.highlight_until && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                  Destaque
                </span>
              )}
            </div>

            <h3 className="line-clamp-2 text-base font-semibold text-zinc-900">
              {item.title || `${item.brand || ""} ${item.model || ""}`.trim() || "Veículo"}
            </h3>

            <p className="mt-2 text-xl font-bold text-zinc-900">
              {formatPrice(item.price)}
            </p>

            <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-500">
              {item.year ? <span>{item.year}</span> : null}
              <span>{formatMileage(item.mileage)}</span>
            </div>

            <div className="mt-3 text-sm text-zinc-500">
              {[item.city, item.state].filter(Boolean).join(" - ")}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
