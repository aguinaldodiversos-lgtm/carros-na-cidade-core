import { Suspense, type ReactNode } from "react";

import { ContentCardsSection } from "@/components/home/sections/ContentCardsSection";
import { ExploreByState } from "@/components/home/sections/ExploreByState";
import { HomeCarouselsSkeleton } from "@/components/home/sections/HomeCarouselsSkeleton";
import { HomeHero } from "@/components/home/sections/HomeHero";
import { PromoCarousel } from "@/components/home/sections/PromoCarousel";

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
  state?: string;
  demand_score?: number;
};

type HomeStats = {
  total_ads?: number | string;
  total_cities?: number | string;
  total_advertisers?: number | string;
  total_users?: number | string;
};

type StateAggregation = { uf: string; offers: number | string };

interface HomePageClientProps {
  data: {
    featuredCities: FeaturedCity[];
    adsByState?: StateAggregation[];
    stats: HomeStats;
  };
  activeCitySlug: string;
  activeCityName: string;
  /** Slot de streaming: HomeCarousels embrulhado em <Suspense> na page.tsx. */
  carousels: ReactNode;
}

export function HomePageClient({
  data,
  activeCitySlug,
  activeCityName: _activeCityName,
  carousels,
}: HomePageClientProps) {
  const featuredCities = data.featuredCities || [];

  return (
    <div className="bg-[#f7f7fb] pb-6">
      <HomeHero featuredCities={featuredCities} defaultCitySlug={activeCitySlug} />

      <PromoCarousel />

      <ExploreByState items={data.adsByState} />

      <Suspense fallback={<HomeCarouselsSkeleton />}>{carousels}</Suspense>

      <ContentCardsSection />
    </div>
  );
}
