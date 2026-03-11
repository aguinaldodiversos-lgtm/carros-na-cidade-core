import type { AdItem } from "@/lib/search/ads-search";
import { AdCard } from "./AdCard";

interface AdGridProps {
  items: AdItem[];
  priorityFirstRow?: boolean;
}

export function AdGrid({ items, priorityFirstRow = false }: AdGridProps) {
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => (
        <AdCard
          key={`${item.id}-${item.slug || index}`}
          item={item}
          priority={priorityFirstRow && index < 3}
        />
      ))}
    </div>
  );
}
