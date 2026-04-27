// frontend/components/home/HomePageClient.tsx
import { Suspense, type ReactNode } from "react";

import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { ContentCardsSection } from "@/components/home/sections/ContentCardsSection";
import { ExploreByState } from "@/components/home/sections/ExploreByState";
import { HomeCarouselsSkeleton } from "@/components/home/sections/HomeCarouselsSkeleton";
import { HomeHero } from "@/components/home/sections/HomeHero";
import { HomePrimaryActions } from "@/components/home/sections/HomePrimaryActions";
import { HomeShortcuts } from "@/components/home/sections/HomeShortcuts";

/**
 * Orquestrador da Home — alinhado ao contrato visual oficial em
 * `frontend/public/images/pagina Home.png`.
 *
 * Ordem das seções (mobile-first, carros aparecem cedo):
 *   1. HomeHero            — banner regional + busca + chips de filtro
 *   2. HomeShortcuts       — 6 atalhos circulares: Comprar, Vender, Blog,
 *                            Ofertas, Lojas, Favoritos (set do mockup)
 *   3. HomePrimaryActions  — 3 cards quick-action: Anunciar grátis, Tabela
 *                            FIPE, Simulador (substituiu o PromoCarousel)
 *   4. HomeCarousels       — Suspense com destaques + oportunidades
 *   5. ExploreByState      — atalhos por estado
 *   6. ContentCardsSection — blog integrado (motor de aquisição)
 *
 * Padding-bottom no main = 20 (80px) para mobile não cobrir conteúdo com
 * BottomNav (regra documentada em frontend/components/ui/BottomNav.tsx).
 *
 * Server Component — render-tree pura, sem hooks. Client Components estão
 * somente em ilhas (HomeHero, HomeBottomNav).
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

        <HomePrimaryActions />

        <Suspense fallback={<HomeCarouselsSkeleton />}>{carousels}</Suspense>

        <ExploreByState items={data.adsByState} />

        <ContentCardsSection />
      </main>

      <SiteBottomNav />
    </>
  );
}
