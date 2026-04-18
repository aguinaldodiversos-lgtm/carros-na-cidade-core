import type { CatalogItem } from "@/components/buy/CatalogVehicleCard";
import CatalogVehicleCard from "@/components/buy/CatalogVehicleCard";

type VehicleGridProps = {
  items: CatalogItem[];
  inferWeight: (item: CatalogItem) => 1 | 2 | 3 | 4;
};

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-800">Nenhum anúncio encontrado</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        Não encontramos veículos com os filtros selecionados nesta região. Tente ampliar sua busca
        ou remover alguns filtros.
      </p>
    </div>
  );
}

export function VehicleGrid({ items, inferWeight }: VehicleGridProps) {
  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
      {items.map((item, index) => (
        <CatalogVehicleCard
          key={`card-${item.id ?? item.slug ?? item.title ?? index}`}
          item={item}
          weight={inferWeight(item)}
        />
      ))}
    </div>
  );
}
