import Image from "next/image";
import Link from "next/link";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import type { ListingCar } from "@/lib/car-data";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

type SellerSectionProps = {
  vehicle: VehicleDetail;
  sellerVehicles: ListingCar[];
  cityVehicles: ListingCar[];
};

export default function SellerSection({ vehicle, sellerVehicles, cityVehicles }: SellerSectionProps) {
  if (vehicle.seller.type === "dealer") {
    return (
      <>
        <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border border-[#dbe2f0] bg-white">
                <Image src={vehicle.seller.logo} alt={vehicle.seller.name} fill className="object-contain p-2" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-[#1d2538]">{vehicle.seller.name}</h2>
                <p className="text-sm text-[#52607b]">{vehicle.seller.address}</p>
                <p className="text-sm font-semibold text-[#0e62d8]">Avaliacao: {vehicle.seller.rating.toFixed(1)} / 5</p>
              </div>
            </div>

            <Link
              href={`/anuncios?city_slug=${vehicle.citySlug}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
            >
              Explorar anuncios na regiao
            </Link>
          </div>
        </section>

        <VehicleCarousel
          title={`Mais anuncios de ${vehicle.seller.name}`}
          subtitle="Veiculos adicionais do lojista com condicoes semelhantes."
          vehicles={sellerVehicles}
        />
      </>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
        <h2 className="text-xl font-extrabold text-[#1d2538]">Anunciante particular</h2>
        <p className="mt-1 text-sm text-[#52607b]">
          Negociacao direta com o proprietario do veiculo. Recomendamos vistoria e conferencia documental.
        </p>
      </section>

      <VehicleCarousel title={`Outros veiculos em ${vehicle.city}`} vehicles={cityVehicles} />
    </>
  );
}
