import { AdCard } from "@/components/ads/AdCard";
import { legacyCarCardToAdItem } from "@/lib/ads/ad-card-adapter";

// Transitional compatibility wrapper: route all legacy card shapes to the official AdCard.
type CarData = {
  slug?: string;
  title: string;
  image: string;
  city?: string;
  state?: string;
  sponsored?: boolean;
  discount?: number | string;
  price: string;
};

type CarCardProps =
  | {
      car: CarData;
    }
  | {
      title: string;
      price: string;
    };

export default function CarCard(props: CarCardProps) {
  const car: CarData =
    "car" in props
      ? props.car
      : {
          title: props.title,
          price: props.price,
          image: "/images/corolla.jpeg",
        };

  return <AdCard item={legacyCarCardToAdItem(car)} />;
}
