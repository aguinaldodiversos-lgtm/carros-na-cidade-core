import type { CatalogItem } from "@/components/buy/CatalogVehicleCard";
import CatalogVehicleCard from "@/components/buy/CatalogVehicleCard";

type VehicleGridProps = {
  featured: CatalogItem[];
  rest: CatalogItem[];
  inferWeight: (item: CatalogItem) => 1 | 2 | 3 | 4;
};

export function VehicleGrid({ featured, rest, inferWeight }: VehicleGridProps) {
  return (
    <>
      {featured.length > 0 ? (
        <div className="mb-6 grid gap-5 lg:grid-cols-2">
          {featured.map((item, index) => (
            <CatalogVehicleCard
              key={`featured-${item.id ?? item.slug ?? item.title ?? index}`}
              item={item}
              featured
              weight={inferWeight(item)}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {rest.map((item, index) => (
          <CatalogVehicleCard
            key={`card-${item.id ?? item.slug ?? item.title ?? index}`}
            item={item}
            weight={inferWeight(item)}
          />
        ))}
      </div>
    </>
  );
}
