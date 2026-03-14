import type { AdItem } from "@/lib/search/ads-search";
import AdCard from "./AdCard";

interface AdGridProps {
  items: AdItem[];
  priorityFirstRow?: boolean;
  priorityCount?: number;
  variant?: "default" | "home";
  className?: string;
}

export function AdGrid({
  items,
  priorityFirstRow = false,
  priorityCount = 3,
  variant = "default",
  className = "",
}: AdGridProps) {
  if (!items.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-[#cbd5e1] bg-white px-6 py-12 text-center shadow-sm">
        <h3 className="text-lg font-bold text-[#0f172a]">
          Nenhum anúncio encontrado
        </h3>
        <p className="mt-2 text-sm text-[#64748b]">
          Ajuste os filtros ou tente uma nova combinação de busca.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        className ||
        `grid gap-4 ${
          variant === "home" ? "grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
        }`
      }
    >
      {items.map((item, index) => (
        <AdCard
          key={`${item.id}-${item.slug || index}`}
          item={item}
          priority={priorityFirstRow && index < priorityCount}
          variant={variant}
        />
      ))}
    </div>
  );
}
