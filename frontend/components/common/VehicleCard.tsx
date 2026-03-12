import type { ListingCar } from "@/lib/car-data";
import { AdCard } from "@/components/ads/AdCard";
import { listingCarToAdItem } from "@/lib/ads/ad-card-adapter";

type VehicleCardProps = {
  vehicle: ListingCar;
};

export default function VehicleCard({ vehicle }: VehicleCardProps) {
  return (
    <div className="w-[290px] shrink-0">
      <AdCard item={listingCarToAdItem(vehicle)} />
    </div>
  );
}
