import { IconPin, IconPriceTag, IconStar } from "@/components/home/icons";
import { ContentCardsSection } from "@/components/home/sections/ContentCardsSection";
import { ExploreByState } from "@/components/home/sections/ExploreByState";
import { HomeHero } from "@/components/home/sections/HomeHero";
import { PromoCarousel } from "@/components/home/sections/PromoCarousel";
import { VehicleCarouselSection } from "@/components/home/sections/VehicleCarouselSection";
import type { VehicleCardItem } from "@/components/home/sections/VehicleCard";

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
  state?: string;
  demand_score?: number;
};

type HomeAdItem = VehicleCardItem;

type HomeStats = {
  total_ads?: number | string;
  total_cities?: number | string;
  total_advertisers?: number | string;
  total_users?: number | string;
};

interface HomePageClientProps {
  data: {
    featuredCities: FeaturedCity[];
    highlightAds: HomeAdItem[];
    opportunityAds: HomeAdItem[];
    recentAds?: HomeAdItem[];
    stats: HomeStats;
  };
  activeCitySlug: string;
  activeCityName: string;
}

export function HomePageClient({ data, activeCitySlug, activeCityName }: HomePageClientProps) {
  const highlights = data.highlightAds || [];
  const opportunities = data.opportunityAds || [];
  const featuredCities = data.featuredCities || [];

  return (
    <div className="bg-[#f7f7fb] pb-6">
      <HomeHero featuredCities={featuredCities} defaultCitySlug={activeCitySlug} />

      <PromoCarousel />

      <ExploreByState />

      <VehicleCarouselSection
        icon={<IconStar className="h-6 w-6" />}
        title="Veículos em destaque"
        subtitle={`Conheça alguns dos veículos mais procurados em ${activeCityName}.`}
        link={{ label: "Ver todos", href: "/comprar" }}
        items={highlights}
        variant="highlight"
        emptyMessage="Nenhum destaque disponível no momento."
      />

      <VehicleCarouselSection
        icon={<IconPriceTag className="h-6 w-6" />}
        title="Oportunidades abaixo da FIPE"
        subtitle="Seu carro pelo melhor preço aguardando seu próximo veículo."
        link={{ label: "Ver todos", href: "/comprar?below_fipe=true" }}
        items={opportunities}
        variant="opportunity"
        emptyMessage="Nenhuma oportunidade abaixo da FIPE agora."
      />

      <ContentCardsSection />
    </div>
  );
}
