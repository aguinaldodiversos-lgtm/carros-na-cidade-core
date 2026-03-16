import Link from "next/link";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import type { ListingCar } from "@/lib/car-data";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

type SellerSectionProps = {
  vehicle: VehicleDetail;
  sellerVehicles: ListingCar[];
  cityVehicles: ListingCar[];
};

const DEFAULT_CITY_SLUG = "sao-paulo-sp";

function toSafeCityCatalogHref(citySlug?: string) {
  const safeSlug = citySlug?.trim() || DEFAULT_CITY_SLUG;
  return `/comprar?city_slug=${encodeURIComponent(safeSlug)}`;
}

export default function SellerSection({
  vehicle,
  sellerVehicles,
  cityVehicles,
}: SellerSectionProps) {
  const cityCatalogHref = toSafeCityCatalogHref(vehicle.citySlug);

  if (vehicle.seller.type === "dealer") {
    const logo = vehicle.seller.logo || "/images/logo.png";
    const sellerName = vehicle.seller.name || "Loja parceira";
    const sellerAddress = vehicle.seller.address || vehicle.city;
    const rating = Number.isFinite(vehicle.seller.rating)
      ? vehicle.seller.rating
      : 4.8;

    return (
      <>
        <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border border-[#dbe2f0] bg-white">
                <img
                  src={logo}
                  alt={sellerName}
                  className="h-full w-full object-contain p-2"
                />
              </div>

              <div>
                <h2 className="text-xl font-extrabold text-[#1d2538]">
                  {sellerName}
                </h2>
                <p className="text-sm text-[#52607b]">{sellerAddress}</p>
                <p className="text-sm font-semibold text-[#0e62d8]">
                  Avaliação: {rating.toFixed(1)} / 5
                </p>
              </div>
            </div>

            <Link
              href={cityCatalogHref}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
            >
              Explorar anúncios na região
            </Link>
          </div>
        </section>

        {sellerVehicles.length > 0 ? (
          <VehicleCarousel
            title={`Mais anúncios de ${sellerName}`}
            subtitle="Veículos adicionais do lojista com condições semelhantes."
            vehicles={sellerVehicles}
          />
        ) : (
          <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
            <h3 className="text-lg font-extrabold text-[#1d2538]">
              Mais anúncios deste lojista
            </h3>
            <p className="mt-2 text-sm leading-7 text-[#52607b]">
              Ainda não há outros veículos disponíveis para exibição neste momento.
            </p>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
        <h2 className="text-xl font-extrabold text-[#1d2538]">
          Anunciante particular
        </h2>
        <p className="mt-1 text-sm text-[#52607b]">
          Negociação direta com o proprietário do veículo. Recomendamos vistoria e conferência documental.
        </p>
      </section>

      {cityVehicles.length > 0 ? (
        <VehicleCarousel
          title={`Outros veículos em ${vehicle.city}`}
          subtitle="Mais oportunidades disponíveis na mesma região."
          vehicles={cityVehicles}
        />
      ) : (
        <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <h3 className="text-lg font-extrabold text-[#1d2538]">
            Outros veículos na região
          </h3>
          <p className="mt-2 text-sm leading-7 text-[#52607b]">
            Ainda não há outros veículos disponíveis para exibição nesta cidade.
          </p>
        </section>
      )}
    </>
  );
}
