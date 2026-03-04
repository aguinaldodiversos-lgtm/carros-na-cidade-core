import type { BuyCar } from "@/lib/car-data";
import BuyCarCard from "@/components/buy/BuyCarCard";

type BuyCarsGridProps = {
  cars: BuyCar[];
};

export default function BuyCarsGrid({ cars }: BuyCarsGridProps) {
  const featuredCars = cars.slice(0, 2);
  const regularCars = cars.slice(2);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {featuredCars.map((car) => (
          <BuyCarCard key={car.id} car={car} featured />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {regularCars.map((car) => (
          <BuyCarCard key={car.id} car={car} />
        ))}
      </div>
    </div>
  );
}
