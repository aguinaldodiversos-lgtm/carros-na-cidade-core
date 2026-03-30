import AdListingCard from "@/components/ads/AdListingCard";
import type { HomeCar } from "@/lib/car-data";

type FeaturedSectionProps = {
  title: string;
  subtitle: string;
  cars: HomeCar[];
};

export default function FeaturedSection({ title, subtitle, cars }: FeaturedSectionProps) {
  return (
    <section className="mt-8">
      <header className="mb-4">
        <h2 className="text-[28px] font-extrabold leading-tight text-[#1d2538] sm:text-[44px]">
          {title}
        </h2>
        <p className="mt-1 text-[19px] text-[#5f6880] sm:text-[32px]">{subtitle}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cars.map((car) => (
          <AdListingCard key={car.id} car={car} />
        ))}
      </div>
    </section>
  );
}
