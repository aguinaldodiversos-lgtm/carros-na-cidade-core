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
    <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <header className="mb-4">
        <h2 className="text-2xl font-extrabold text-[#1d2538]">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm leading-6 text-[#5f6982]">{subtitle}</p>
        ) : null}
      </header>

      {safeVehicles.length > 0 ? (
        <div className="-mx-2 flex snap-x gap-4 overflow-x-auto px-2 pb-3 [scrollbar-width:none] touch-pan-x [&::-webkit-scrollbar]:hidden">
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
        <div className="rounded-2xl border border-dashed border-[#d7deea] bg-[#f8fafc] px-5 py-8 text-center">
          <p className="text-sm font-medium text-[#5f6982]">{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}
