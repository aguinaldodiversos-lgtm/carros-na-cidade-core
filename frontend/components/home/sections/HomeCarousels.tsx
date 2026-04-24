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
 *
 * Quando nao ha anuncios em destaque/oportunidade (criterios raros no
 * lancamento), caimos para recentAds: sempre ha algo para mostrar desde
 * que haja pelo menos 1 anuncio ativo no portal. O fallback territorial
 * para global ja foi tratado em fetchHomeCarousels.
 */
export async function HomeCarousels({
  activeCitySlug,
  activeCityId,
  activeCityName,
}: HomeCarouselsProps) {
  const { highlightAds, opportunityAds, recentAds } = await fetchHomeCarousels(
    activeCitySlug,
    activeCityId
  );

  const highlightItems = (highlightAds.length ? highlightAds : recentAds) as VehicleCardItem[];
  const opportunityItems = (
    opportunityAds.length ? opportunityAds : recentAds
  ) as VehicleCardItem[];

  const highlightTitle = highlightAds.length ? "Veículos em destaque" : "Veículos recentes";
  const highlightSubtitle = highlightAds.length
    ? `Conheça alguns dos veículos mais procurados em ${activeCityName}.`
    : `Anúncios adicionados recentemente perto de ${activeCityName}.`;

  return (
    <>
      <VehicleCarouselSection
        icon={<IconStar className="h-6 w-6" />}
        title={highlightTitle}
        subtitle={highlightSubtitle}
        link={{ label: "Ver todos", href: "/comprar" }}
        items={highlightItems}
        variant="highlight"
        emptyMessage="Nenhum anúncio disponível no momento."
      />

      {opportunityAds.length > 0 ? (
        <VehicleCarouselSection
          icon={<IconPriceTag className="h-6 w-6" />}
          title="Oportunidades abaixo da FIPE"
          subtitle="Seu carro pelo melhor preço aguardando seu próximo veículo."
          link={{ label: "Ver todos", href: "/comprar?below_fipe=true" }}
          items={opportunityItems}
          variant="opportunity"
          emptyMessage="Nenhuma oportunidade abaixo da FIPE agora."
        />
      ) : null}
    </>
  );
}
