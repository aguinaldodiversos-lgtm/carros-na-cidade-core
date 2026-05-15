// frontend/components/home/HomePageClient.tsx
import { Suspense, type ReactNode } from "react";

import { LocationRegionalPrompt } from "@/components/home/LocationRegionalPrompt";
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
 *   2. HomeShortcuts       — 7 atalhos circulares (Comprar, Vender, Blog,
 *                            Ofertas, Lojas, Favoritos, Planos). Centralizados
 *                            em desktop; carrossel scroll-snap em mobile.
 *   3. HomeHero            — banner regional com pílula do escopo (estado ou
 *                            cidade detectada), CTA "Ver ofertas →" e badge.
 *   4. HomePrimaryActions  — 3 cards quick-action coloridos: Anunciar grátis
 *                            (azul), Tabela FIPE (verde), Simulador (roxo)
 *   5. HomeCarousels       — Suspense com destaques + oportunidades (vitrine
 *                            ESTADUAL — substitui o antigo filtro por cidade
 *                            que zerava o inventário fora de SP capital).
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
  /** UF em foco — usado no banner e pelos carrosseis (vitrine estadual). */
  stateUf: string;
  /** Nome do estado em foco (ex: "São Paulo"). */
  stateName: string;
  /** Cidade detectada via cookie/query — usada como contexto secundário. */
  detectedCity?: { slug: string; name: string } | null;
  /** Slot de streaming: HomeCarousels embrulhado em <Suspense> na page.tsx. */
  carousels: ReactNode;
  /**
   * Slot opcional para o bloco "Explore por região" — renderizado entre
   * ExploreByState e ContentCardsSection. `null` quando flag regional
   * está off ou o endpoint não retornou regiões.
   */
  stateRegions?: ReactNode;
  /**
   * Vem do server (lê REGIONAL_PAGE_ENABLED). Controla se o
   * `LocationRegionalPrompt` exibe o CTA primário "Ver ofertas da região"
   * após a geolocalização — quando off, o componente só oferece cidade
   * e estado como destinos.
   */
  regionalEnabled: boolean;
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
  stateUf,
  stateName,
  detectedCity = null,
  carousels,
  stateRegions = null,
  regionalEnabled,
}: HomePageClientProps) {
  const totalAds = parseTotalAds(data?.stats?.total_ads);

  // Search/Hero usam `defaultCitySlug` quando há cidade detectada para
  // preservar contexto na busca. Sem cidade detectada, ficam vazios e o
  // /comprar canoniza para o catálogo estadual padrão.
  const defaultCitySlug = detectedCity?.slug ?? "";
  const detectedCityName = detectedCity?.name;

  return (
    <>
      <main className="bg-cnc-bg pb-20 md:pb-12">
        <HomeSearchCard defaultCitySlug={defaultCitySlug} />

        {/*
          LocationRegionalPrompt — PR 4 territorial.
          Server passa regionalEnabled (flag REGIONAL_PAGE_ENABLED). O
          componente NUNCA pede geolocalização automaticamente; só ao
          clicar no CTA. Coordenadas vivem só na memória do callback —
          sem storage, sem log.
        */}
        <LocationRegionalPrompt
          regionalEnabled={regionalEnabled}
          stateName={stateName}
          stateCode={stateUf}
        />

        <HomeShortcuts />

        <HomeHero
          defaultCitySlug={defaultCitySlug}
          cityName={detectedCityName}
          stateName={stateName}
          totalAds={totalAds}
        />

        <HomePrimaryActions />

        <Suspense fallback={<HomeCarouselsSkeleton />}>{carousels}</Suspense>

        <ExploreByState items={data.adsByState} />

        {stateRegions}

        <ContentCardsSection />
      </main>

      <SiteBottomNav />
    </>
  );
}
