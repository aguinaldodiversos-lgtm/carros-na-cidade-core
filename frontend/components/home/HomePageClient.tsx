// frontend/components/home/HomePageClient.tsx
import { Suspense, type ReactNode } from "react";

import { LocationRegionalPrompt } from "@/components/home/LocationRegionalPrompt";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { ContentCardsSection } from "@/components/home/sections/ContentCardsSection";
import { HomeAnnounceBanner } from "@/components/home/sections/HomeAnnounceBanner";
import { HomeCarouselsSkeleton } from "@/components/home/sections/HomeCarouselsSkeleton";
import {
  HomeHero,
  type HomeHeroBannerOverride,
  type HomeHeroOverride,
} from "@/components/home/sections/HomeHero";
import { HomePrimaryActions } from "@/components/home/sections/HomePrimaryActions";
import { HomeProfileSearch } from "@/components/home/sections/HomeProfileSearch";
import { HomeSearchCard } from "@/components/home/sections/HomeSearchCard";
import { HomeShortcuts } from "@/components/home/sections/HomeShortcuts";
import type { HomeProfileChip } from "@/lib/home/home-discovery";

/**
 * Orquestrador da Home — reestruturação 2026-07-11.
 *
 * Ordem das seções (mobile-first):
 *   1.  HomeHero            — carrossel de banners (subiu para o topo)
 *   2.  HomeSearchCard      — busca por marca, modelo ou cidade + filtros
 *   3.  HomeShortcuts       — atalhos (Comprar, Vender, FIPE, Ofertas, Planos)
 *   4.  LocationRegionalPrompt — "ver carros próximos de você"
 *   5.  HomeProfileSearch   — busca por perfil (NOVO; chips validados)
 *   6.  HomeCarousels       — Suspense: veículos recentes + abaixo da FIPE
 *   7.  HomeAnnounceBanner  — banner "Anuncie Grátis" (NOVO)
 *   8.  HomePrimaryActions  — ações rápidas: Tabela FIPE + Simulador
 *   9.  ContentCardsSection — blog integrado (motor de aquisição)
 *
 * Removidos: o Hero textual (virou <h1> sr-only em app/page.tsx),
 * HomeTrustStrip ("Por que escolher"), ExploreByState e o bloco "Explore por
 * região". O bloco SEO "Continue sua busca" (HomeSeoLinks) também foi removido
 * — duplicava o rodapé (Modelos mais buscados / Cidades com mais carros) e a
 * faixa de preço já vive no filtro lateral.
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
  /** Chips de "Busca por perfil" já validados (não-vazios) por fetchHomeDiscovery. */
  profiles: HomeProfileChip[];
  /**
   * Vem do server (lê REGIONAL_PAGE_ENABLED). Controla se o
   * `LocationRegionalPrompt` exibe o CTA primário "Ver ofertas da região"
   * após a geolocalização — quando off, o componente só oferece cidade
   * e estado como destinos.
   */
  regionalEnabled: boolean;
  /**
   * Override LEGADO do hero (Fase 4.1). Banner único. Usado apenas se
   * `heroBanners` estiver vazio.
   */
  heroOverride?: HomeHeroOverride | null;
  /**
   * Lista de banners ativos vindos do admin (Fase 4.1.1). Quando 1 entry,
   * a Home renderiza estático; 2-3, carrossel CSS scroll-snap.
   */
  heroBanners?: readonly HomeHeroBannerOverride[] | null;
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
  profiles,
  regionalEnabled,
  heroOverride = null,
  heroBanners = null,
}: HomePageClientProps) {
  const totalAds = parseTotalAds(data?.stats?.total_ads);

  // Search/Hero usam `defaultCitySlug` quando há cidade detectada para
  // preservar contexto na busca. Sem cidade detectada, ficam vazios e o
  // /comprar canoniza para o catálogo estadual padrão.
  const defaultCitySlug = detectedCity?.slug ?? "";
  const detectedCityName = detectedCity?.name;

  return (
    <>
      {/*
        `<div>` (não `<main>`): o `<main id="main-content">` é criado pelo root
        layout. Evita `<main>` aninhado/duplicado (auditoria SSR 2026-06-27).
      */}
      <div className="bg-cnc-bg pb-20 md:pb-12">
        {/* 1. Carrossel de banners — subiu para o topo (reestruturação 2026-07-11). */}
        <HomeHero
          defaultCitySlug={defaultCitySlug}
          cityName={detectedCityName}
          stateName={stateName}
          totalAds={totalAds}
          override={heroOverride}
          banners={heroBanners}
        />

        {/* 2. Busca. */}
        <HomeSearchCard defaultCitySlug={defaultCitySlug} />

        {/* 3. Atalhos rápidos. */}
        <HomeShortcuts />

        {/*
          4. Localização — LocationRegionalPrompt (PR 4 territorial).
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

        {/* 5. Busca por perfil (some se nenhum chip sobreviveu à validação). */}
        <HomeProfileSearch profiles={profiles} />

        {/* 6. Veículos recentes + 7. Oportunidades abaixo da FIPE. */}
        <Suspense fallback={<HomeCarouselsSkeleton />}>{carousels}</Suspense>

        {/* 8. Banner "Anuncie Grátis". */}
        <HomeAnnounceBanner />

        {/* 9. Ações rápidas — Tabela FIPE + Simulador. */}
        <HomePrimaryActions />

        {/* 10. Conteúdo / Blog. */}
        <ContentCardsSection />
      </div>

      <SiteBottomNav />
    </>
  );
}
