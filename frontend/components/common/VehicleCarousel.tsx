import type { ListingCar } from "@/lib/car-data";
import VehicleCard from "@/components/common/VehicleCard";

type VehicleCarouselProps = {
  title: string;
  subtitle?: string;
  vehicles: ListingCar[];
};

export default function VehicleCarousel({ title, subtitle, vehicles }: VehicleCarouselProps) {
  return (
    <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <header className="mb-4">
        <h2 className="text-2xl font-extrabold text-[#1d2538]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#5f6982]">{subtitle}</p>}
      </header>

      <div className="-mx-2 flex snap-x gap-4 overflow-x-auto px-2 pb-3 [scrollbar-width:none] touch-pan-x">
        {vehicles.map((vehicle) => (
          <div key={vehicle.id} className="snap-start">
            <VehicleCard vehicle={vehicle} />
          </div>
        ))}
      </div>
    </section>
  );
}
