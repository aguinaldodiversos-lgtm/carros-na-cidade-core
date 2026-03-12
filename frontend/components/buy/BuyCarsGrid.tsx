import { AdGrid } from "@/components/ads/AdGrid";
import type { AdItem } from "@/lib/search/ads-search";

type BuyCarsGridProps = {
  items: AdItem[];
};

export default function BuyCarsGrid({ items }: BuyCarsGridProps) {
  return (
    <AdGrid
      items={items}
      priorityFirstRow
      priorityCount={3}
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    />
  );
}
