import type { ListingCar } from "@/lib/car-data";
import VehicleCard from "@/components/common/VehicleCard";

type VehicleCarouselProps = {
  title: string;
  subtitle?: string;
  vehicles?: ListingCar[] | null;
  emptyMessage?: string;
};

function sanitizeVehicles(vehicles?: ListingCar[] | null) {
  if (!Array.isArray(vehicles)) return [];
  return vehicles.filter(Boolean);
}

export default function VehicleCarousel({
  title,
  subtitle,
  vehicles,
  emptyMessage = "Nenhum veículo disponível no momento.",
}: VehicleCarouselProps) {
  const safeVehicles = sanitizeVehicles(vehicles);

  return (
    <section className="mt-8 rounded-[22px] border border-[#e1e6f0] bg-white p-5 shadow-[0_8px_28px_rgba(10,20,40,0.06)] md:p-6">
      <header className="mb-5 border-b border-[#f0f3f8] pb-4">
        <h2 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[#1d2538] md:text-2xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 text-[14px] leading-relaxed text-[#5f6982] md:text-[15px]">{subtitle}</p>
        ) : null}
      </header>

      {safeVehicles.length > 0 ? (
        <div className="-mx-2 flex snap-x gap-4 overflow-x-auto px-2 pb-2 [scrollbar-width:none] touch-pan-x [&::-webkit-scrollbar]:hidden">
          {safeVehicles.map((vehicle, index) => (
            <div
              key={vehicle.id || vehicle.slug || `${vehicle.model}-${index}`}
              className="snap-start"
            >
              <VehicleCard vehicle={vehicle} />
            </div>
          ))}
        </div>
      ) : (
        <div className="cnc-empty-state py-9 sm:py-10">
          <p className="cnc-empty-state__title text-[16px]">{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}
