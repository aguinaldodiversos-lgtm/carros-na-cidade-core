import type { ListingCar } from "@/lib/car-data";
import AdCard from "@/components/ads/AdCard";
import { listingCarToAdItem } from "@/lib/ads/ad-card-adapter";

type VehicleCardProps = {
  vehicle: ListingCar;
};

export default function VehicleCard({ vehicle }: VehicleCardProps) {
  const item = listingCarToAdItem(vehicle);

  return (
    <div className="w-[290px] max-w-full shrink-0">
      <AdCard item={item} />
    </div>
  );
}
