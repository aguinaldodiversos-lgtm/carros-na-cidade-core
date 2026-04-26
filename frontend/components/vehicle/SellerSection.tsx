// frontend/components/vehicle/SellerSection.tsx

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VehicleImage } from "@/components/ui/VehicleImage";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";
import { SITE_ROUTES } from "@/lib/site/site-navigation";
import type { ListingCar } from "@/lib/car-data";
import { formatPhoneDisplay } from "@/lib/vehicle/detail-utils";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

/**
 * PR I — SellerSection refatorado:
 *   - Logo do vendedor migrado para <VehicleImage variant="thumb"> (resolve IMG-6
 *     violação de <img> cru sem sizes/fallback);
 *   - Tokens do DS substituem hex hardcoded;
 *   - Bloco de confiança com <Card> + <Badge> + <Button> oficiais;
 *   - Mantém função e dados (não mexe em conteúdo SEO).
 */

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
        <Card variant="default" padding="lg" as="section">
          <p className="text-xs font-bold uppercase tracking-wideish text-cnc-muted">
            Anunciante — loja
          </p>

          <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-cnc-line bg-cnc-surface shadow-card">
                <VehicleImage
                  src={logo}
                  alt={sellerName}
                  width={64}
                  height={64}
                  variant="thumb"
                  className="h-full w-full object-contain p-2"
                  fallbackLabel="Logo indisponível"
                />
              </div>

              <div className="min-w-0">
                <h2 className="text-xl font-extrabold leading-tight text-cnc-text-strong md:text-2xl">
                  {sellerName}
                </h2>
                <p className="mt-1 text-sm text-cnc-muted">{sellerAddress}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="info" size="md">
                    Loja no Carros na Cidade
                  </Badge>
                  <span className="text-sm font-semibold text-cnc-text-strong">
                    Avaliação média {rating.toFixed(1)} / 5
                  </span>
                </div>

                {phoneDisplay ? (
                  <p className="mt-3 text-sm text-cnc-muted">
                    <span className="font-semibold text-cnc-text-strong">Telefone:</span>{" "}
                    {phoneDisplay}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-cnc-muted">
                    Use o formulário ao lado para solicitar contato ou tirar dúvidas sobre o
                    veículo.
                  </p>
                )}

                <p className="mt-3 text-sm leading-relaxed text-cnc-muted">
                  Negocie com calma: combine visita, peça laudo ou vistoria e confira documentação
                  antes de fechar.{" "}
                  <Link
                    href={SITE_ROUTES.seguranca}
                    className="font-semibold text-primary hover:underline"
                  >
                    Boas práticas de segurança
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
              <Button href={cityCatalogHref} variant="primary" size="lg">
                Ver mais na região
              </Button>
              <Link
                href={SITE_ROUTES.comoFunciona}
                className="text-center text-xs font-semibold text-cnc-muted hover:text-primary"
              >
                Saiba mais sobre o portal
              </Link>
            </div>
          </div>
        </Card>

        {sellerVehicles.length > 0 ? (
          <VehicleCarousel
            title={`Mais anúncios de ${sellerName}`}
            subtitle="Outros veículos publicados por este anunciante."
            vehicles={sellerVehicles}
          />
        ) : (
          <Card variant="default" padding="lg" as="section" className="mt-5">
            <h3 className="text-lg font-extrabold text-cnc-text-strong">
              Mais anúncios deste lojista
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
              Não há outros veículos em destaque deste anunciante no momento. Explore a listagem da
              cidade para ver ofertas semelhantes.
            </p>
          </Card>
        )}
      </>
    );
  }

  const privateName = vehicle.seller.name || "Anunciante particular";

  return (
    <>
      <Card variant="default" padding="lg" as="section">
        <p className="text-xs font-bold uppercase tracking-wideish text-cnc-muted">
          Anunciante — particular
        </p>

        <h2 className="mt-2 text-xl font-extrabold text-cnc-text-strong md:text-2xl">
          {privateName}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
          Venda direta entre pessoas. Combine inspeção presencial, verificação de multas e histórico
          antes de qualquer pagamento. O Carros na Cidade não intermedia valores nem documentos.
        </p>

        {phoneDisplay ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold text-cnc-text-strong">Contato informado:</span>{" "}
            <span className="text-cnc-muted">{phoneDisplay}</span>
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 border-t border-cnc-line pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Link
            href={SITE_ROUTES.seguranca}
            className="text-sm font-bold text-primary hover:underline"
          >
            Checklist de negociação segura com particular
          </Link>
          <Button href={cityCatalogHref} variant="secondary" size="md">
            Ver outros carros em {vehicle.city.split("(")[0].trim()}
          </Button>
        </div>
      </Card>

      {showCityCarousel ? (
        <VehicleCarousel
          title={`Outros veículos em ${vehicle.city}`}
          subtitle="Mais opções na mesma região, com filtros na listagem."
          vehicles={cityVehicles}
        />
      ) : (
        <Card variant="default" padding="lg" as="section" className="mt-5">
          <h3 className="text-lg font-extrabold text-cnc-text-strong">Outros veículos na região</h3>
          <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
            Explore a listagem completa da cidade para encontrar mais modelos disponíveis.
          </p>
        </Card>
      )}
    </>
  );
}
