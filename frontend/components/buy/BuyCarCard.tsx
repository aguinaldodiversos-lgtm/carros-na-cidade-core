import AdListingCard from "@/components/ads/AdListingCard";
import type { BuyCar } from "@/lib/car-data";

type BuyCarCardProps = {
  car: BuyCar;
  featured?: boolean;
};

export default function BuyCarCard({ car, featured = false }: BuyCarCardProps) {
  return <AdListingCard car={car} featured={featured} />;
}
