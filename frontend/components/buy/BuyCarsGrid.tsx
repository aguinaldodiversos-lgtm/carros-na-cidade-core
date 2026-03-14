import AdCard from "@/components/ads/AdCard";
import type { AdItem } from "@/lib/search/ads-search";

type BuyCarsGridProps = {
  items: AdItem[];
};

export default function BuyCarsGrid({ items }: BuyCarsGridProps) {
  const featuredItems = items.slice(0, 2);
  const remainingItems = items.slice(2);

  return (
    <div className="space-y-4">
      {featuredItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {featuredItems.map((item, index) => (
            <AdCard
              key={`${item.id}-${item.slug || index}`}
              item={item}
              priority={index < 2}
            />
          ))}
        </div>
      ) : null}

      {remainingItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {remainingItems.map((item, index) => (
            <AdCard
              key={`${item.id}-${item.slug || index}`}
              item={item}
              priority={index < 3}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
