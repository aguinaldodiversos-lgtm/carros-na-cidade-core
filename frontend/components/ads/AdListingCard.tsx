import { AdCard } from "@/components/ads/AdCard";
import type { ListingCar } from "@/lib/car-data";
import { listingCarToAdItem } from "@/lib/ads/ad-card-adapter";

type AdListingCardProps = {
  car: ListingCar;
  featured?: boolean;
};

export default function AdListingCard({
  car,
  featured = false,
}: AdListingCardProps) {
  return <AdCard item={listingCarToAdItem(car)} priority={featured} />;
}
