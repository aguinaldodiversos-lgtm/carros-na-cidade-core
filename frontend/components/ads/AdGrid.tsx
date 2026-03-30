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
      <div className="cnc-empty-state">
        <p className="cnc-empty-state__title">Nenhum anúncio encontrado</p>
        <p className="cnc-empty-state__desc">
          Afrouxe um filtro, troque a ordenação ou busque outro modelo — o catálogo deste território
          pode mudar ao longo do dia.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        className ||
        `grid gap-4 ${
          variant === "home"
            ? "grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
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
