// frontend/components/home/HomePageClient.tsx
import { Suspense, type ReactNode } from "react";

import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { ContentCardsSection } from "@/components/home/sections/ContentCardsSection";
import { ExploreByState } from "@/components/home/sections/ExploreByState";
import { HomeCarouselsSkeleton } from "@/components/home/sections/HomeCarouselsSkeleton";
import { HomeHero } from "@/components/home/sections/HomeHero";
import { HomeShortcuts } from "@/components/home/sections/HomeShortcuts";
import { PromoCarousel } from "@/components/home/sections/PromoCarousel";

/**
 * PR G — Orquestrador da Home reescrito.
 *
 * Ordem das seções (mobile-first, carros aparecem cedo):
 *   1. HomeHero          — banner + busca + chips de filtro (acima da dobra)
 *   2. HomeShortcuts     — atalhos circulares (Comprar, Vender, FIPE,
 *                          Simulador, Blog, Lojas) — equivalente "stories"
 *                          mas com semântica útil
 *   3. HomeCarousels     — Suspense com destaques + oportunidades (carros
 *                          aparecem CEDO, ainda above-the-fold em desktop)
 *   4. PromoCarousel     — 3 cards de proposta de valor (FIPE/Sim/Anuncio)
 *   5. ExploreByState    — atalhos por estado
 *   6. ContentCardsSection — blog integrado (motor de aquisição)
 *
 * Padding-bottom no main = 20 (80px) para mobile não cobrir conteúdo com
 * BottomNav (regra documentada em frontend/components/ui/BottomNav.tsx).
 *
 * Server Component — render-tree pura, sem hooks. Client Components estão
 * somente em ilhas (HomeHero, PromoCarousel, HomeBottomNav).
 */

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
  activeCityName,
  carousels,
}: HomePageClientProps) {
  const featuredCities = data.featuredCities || [];

  return (
    <>
      <main className="bg-cnc-bg pb-20 md:pb-12">
        <HomeHero
          featuredCities={featuredCities}
          defaultCitySlug={activeCitySlug}
          cityName={activeCityName}
        />

        <HomeShortcuts />

        <Suspense fallback={<HomeCarouselsSkeleton />}>{carousels}</Suspense>

        <PromoCarousel />

        <ExploreByState items={data.adsByState} />

        <ContentCardsSection />
      </main>

      <SiteBottomNav />
    </>
  );
}
