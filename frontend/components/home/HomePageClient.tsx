// frontend/components/home/HomePageClient.tsx
import { Suspense, type ReactNode } from "react";

import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { ContentCardsSection } from "@/components/home/sections/ContentCardsSection";
import { ExploreByState } from "@/components/home/sections/ExploreByState";
import { HomeCarouselsSkeleton } from "@/components/home/sections/HomeCarouselsSkeleton";
import { HomeHero } from "@/components/home/sections/HomeHero";
import { HomePrimaryActions } from "@/components/home/sections/HomePrimaryActions";
import { HomeSearchCard } from "@/components/home/sections/HomeSearchCard";
import { HomeShortcuts } from "@/components/home/sections/HomeShortcuts";

/**
 * Orquestrador da Home — alinhado ao contrato visual oficial em
 * `frontend/public/images/pagina Home.png`.
 *
 * Ordem das seções (mobile-first, fiel ao mockup):
 *   1. HomeSearchCard      — SearchBar + chips de filtro com ícones
 *   2. HomeShortcuts       — 6 atalhos circulares (Comprar, Vender, Blog,
 *                            Ofertas, Lojas, Favoritos) — set do mockup
 *   3. HomeHero            — banner regional com pílula da cidade, CTA
 *                            "Ver ofertas →" e badge "+N mil ofertas ativas"
 *   4. HomePrimaryActions  — 3 cards quick-action coloridos: Anunciar grátis
 *                            (azul), Tabela FIPE (verde), Simulador (roxo)
 *   5. HomeCarousels       — Suspense com destaques + oportunidades
 *   6. ExploreByState      — atalhos por estado
 *   7. ContentCardsSection — blog integrado (motor de aquisição)
 *
 * Padding-bottom no main = 20 (80px) para mobile não cobrir conteúdo com
 * BottomNav (regra documentada em frontend/components/ui/BottomNav.tsx).
 *
 * Server Component — render-tree pura, sem hooks. Client Components estão
 * somente em ilhas (HomeSearchCard, HomeHero, SiteBottomNav).
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

function parseTotalAds(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseInt(value.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function HomePageClient({
  data,
  activeCitySlug,
  activeCityName,
  carousels,
}: HomePageClientProps) {
  const totalAds = parseTotalAds(data?.stats?.total_ads);

  return (
    <>
      <main className="bg-cnc-bg pb-20 md:pb-12">
        <HomeSearchCard defaultCitySlug={activeCitySlug} />

        <HomeShortcuts />

        <HomeHero defaultCitySlug={activeCitySlug} cityName={activeCityName} totalAds={totalAds} />

        <HomePrimaryActions />

        <Suspense fallback={<HomeCarouselsSkeleton />}>{carousels}</Suspense>

        <ExploreByState items={data.adsByState} />

        <ContentCardsSection />
      </main>

      <SiteBottomNav />
    </>
  );
}
