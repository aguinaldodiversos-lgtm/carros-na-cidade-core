import Link from "next/link";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";
import { SITE_ROUTES } from "@/lib/site/site-navigation";
import type { ListingCar } from "@/lib/car-data";
import { formatPhoneDisplay } from "@/lib/vehicle/detail-utils";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

type SellerSectionProps = {
  vehicle: VehicleDetail;
  sellerVehicles: ListingCar[];
  cityVehicles: ListingCar[];
};

function toSafeCityCatalogHref(citySlug?: string) {
  const safeSlug = citySlug?.trim() || DEFAULT_PUBLIC_CITY_SLUG;
  return `/comprar?city_slug=${encodeURIComponent(safeSlug)}`;
}

export default function SellerSection({
  vehicle,
  sellerVehicles,
  cityVehicles,
}: SellerSectionProps) {
  const cityCatalogHref = toSafeCityCatalogHref(vehicle.citySlug);
  const phoneDisplay = formatPhoneDisplay(vehicle.seller.phone);

  const showSellerCarousel =
    vehicle.seller.type === "dealer" && vehicle.isPaidListing && sellerVehicles.length > 0;

  const showCityCarousel =
    (!showSellerCarousel || (vehicle.seller.type === "dealer" && !vehicle.isPaidListing)) &&
    cityVehicles.length > 0;

  if (vehicle.seller.type === "dealer") {
    const logo = vehicle.seller.logo || SITE_LOGO_SRC;
    const sellerName = vehicle.seller.name || "Loja parceira";
    const sellerAddress = vehicle.seller.address || vehicle.city;
    const rating = Number.isFinite(vehicle.seller.rating) ? vehicle.seller.rating : 4.8;

    return (
      <>
        <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#6b768c]">
            Anunciante — loja
          </p>

          <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-[#dbe2f0] bg-white shadow-sm">
                <img src={logo} alt={sellerName} className="h-full w-full object-contain p-2" />
              </div>

              <div className="min-w-0">
                <h2 className="text-xl font-extrabold leading-tight text-[#1d2538] md:text-[22px]">
                  {sellerName}
                </h2>
                <p className="mt-1 text-sm text-[#52607b]">{sellerAddress}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#eef4ff] px-3 py-1 text-[12px] font-bold text-[#0e62d8]">
                    Loja no Carros na Cidade
                  </span>
                  <span className="text-sm font-semibold text-[#2a3550]">
                    Avaliação média {rating.toFixed(1)} / 5
                  </span>
                </div>

                {phoneDisplay ? (
                  <p className="mt-3 text-sm text-[#52607b]">
                    <span className="font-semibold text-[#3d4a63]">Telefone:</span> {phoneDisplay}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-[#6b768c]">
                    Use o formulário ao lado para solicitar contato ou tirar dúvidas sobre o
                    veículo.
                  </p>
                )}

                <p className="mt-3 text-[13px] leading-relaxed text-[#6b768c]">
                  Negocie com calma: combine visita, peça laudo ou vistoria e confira documentação
                  antes de fechar.{" "}
                  <Link
                    href={SITE_ROUTES.seguranca}
                    className="font-semibold text-[#0e62d8] hover:underline"
                  >
                    Boas práticas de segurança
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 md:items-end">
              <Link
                href={cityCatalogHref}
                className="inline-flex h-11 min-w-[200px] items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
              >
                Ver mais na região
              </Link>
              <Link
                href={SITE_ROUTES.comoFunciona}
                className="text-center text-[13px] font-semibold text-[#5c667a] hover:text-[#0e62d8]"
              >
                Como funciona o marketplace
              </Link>
            </div>
          </div>
        </section>

        {sellerVehicles.length > 0 ? (
          <VehicleCarousel
            title={`Mais anúncios de ${sellerName}`}
            subtitle="Outros veículos publicados por este anunciante."
            vehicles={sellerVehicles}
          />
        ) : (
          <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
            <h3 className="text-lg font-extrabold text-[#1d2538]">Mais anúncios deste lojista</h3>
            <p className="mt-2 text-sm leading-7 text-[#52607b]">
              Não há outros veículos em destaque deste anunciante no momento. Explore a listagem da
              cidade para ver ofertas semelhantes.
            </p>
          </section>
        )}
      </>
    );
  }

  const privateName = vehicle.seller.name || "Anunciante particular";

  return (
    <>
      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#6b768c]">
          Anunciante — particular
        </p>

        <h2 className="mt-2 text-xl font-extrabold text-[#1d2538] md:text-[22px]">{privateName}</h2>

        <p className="mt-2 text-sm leading-relaxed text-[#52607b]">
          Venda direta entre pessoas. Combine inspeção presencial, verificação de multas e histórico
          antes de qualquer pagamento. O Carros na Cidade não intermedia valores nem documentos.
        </p>

        {phoneDisplay ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold text-[#3d4a63]">Contato informado:</span>{" "}
            <span className="text-[#52607b]">{phoneDisplay}</span>
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 border-t border-[#eef1f6] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Link
            href={SITE_ROUTES.seguranca}
            className="text-sm font-bold text-[#0e62d8] hover:underline"
          >
            Checklist de negociação segura com particular
          </Link>
          <Link
            href={cityCatalogHref}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#d7deeb] bg-[#fafbfd] px-4 text-sm font-bold text-[#3d4a63] transition hover:border-[#b8c4da]"
          >
            Ver outros carros em {vehicle.city.split("(")[0].trim()}
          </Link>
        </div>
      </section>

      {showCityCarousel ? (
        <VehicleCarousel
          title={`Outros veículos em ${vehicle.city}`}
          subtitle="Mais opções na mesma região, com filtros na listagem."
          vehicles={cityVehicles}
        />
      ) : (
        <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <h3 className="text-lg font-extrabold text-[#1d2538]">Outros veículos na região</h3>
          <p className="mt-2 text-sm leading-7 text-[#52607b]">
            Explore a listagem completa da cidade para encontrar mais modelos disponíveis.
          </p>
        </section>
      )}
    </>
  );
}
