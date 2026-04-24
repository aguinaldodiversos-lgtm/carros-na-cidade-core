import { IconPriceTag, IconStar } from "@/components/home/icons";
import { VehicleCarouselSection } from "@/components/home/sections/VehicleCarouselSection";
import type { VehicleCardItem } from "@/components/home/sections/VehicleCard";
import { fetchHomeCarousels } from "@/lib/home/public-home";

interface HomeCarouselsProps {
  activeCitySlug?: string;
  activeCityId?: number;
  activeCityName: string;
}

/**
 * Server Component async — renderizado dentro de <Suspense> em app/page.tsx
 * para permitir stream do HTML acima da dobra antes dos anuncios chegarem.
 */
export async function HomeCarousels({
  activeCitySlug,
  activeCityId,
  activeCityName,
}: HomeCarouselsProps) {
  const { highlightAds, opportunityAds } = await fetchHomeCarousels(activeCitySlug, activeCityId);

  return (
    <>
      <VehicleCarouselSection
        icon={<IconStar className="h-6 w-6" />}
        title="Veículos em destaque"
        subtitle={`Conheça alguns dos veículos mais procurados em ${activeCityName}.`}
        link={{ label: "Ver todos", href: "/comprar" }}
        items={highlightAds as VehicleCardItem[]}
        variant="highlight"
        emptyMessage="Nenhum destaque disponível no momento."
      />

      <VehicleCarouselSection
        icon={<IconPriceTag className="h-6 w-6" />}
        title="Oportunidades abaixo da FIPE"
        subtitle="Seu carro pelo melhor preço aguardando seu próximo veículo."
        link={{ label: "Ver todos", href: "/comprar?below_fipe=true" }}
        items={opportunityAds as VehicleCardItem[]}
        variant="opportunity"
        emptyMessage="Nenhuma oportunidade abaixo da FIPE agora."
      />
    </>
  );
}
