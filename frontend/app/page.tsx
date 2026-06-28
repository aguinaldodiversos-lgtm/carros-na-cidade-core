// frontend/app/page.tsx
import { Suspense } from "react";
import { cookies } from "next/headers";

import { HomePageClient } from "@/components/home/HomePageClient";
import { HomeCarousels } from "@/components/home/sections/HomeCarousels";
import { StateRegionsBlock } from "@/components/territorial/StateRegionsBlock";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { fetchHomeAboveFold, fetchHomeHero } from "@/lib/home/public-home";
import { buildHomeJsonLd } from "@/lib/seo/home-structured-data";
import { fetchStateRegions } from "@/lib/territory/fetch-state-regions";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getFirstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Intro SÍNCRONO da Home — componente server 100% síncrono: SEM await, SEM
 * fetch, SEM client component, SEM Suspense. É renderizado pela `HomePage`
 * (também síncrona) ANTES do <Suspense> do conteúdo pesado, então o H1 entra
 * no `<main>` no PRIMEIRO flush do HTML — antes do footer.
 *
 * CRÍTICO: NÃO tornar async, NÃO mover para dentro de componente async/
 * Suspense e NÃO depender de dados remotos. Qualquer await acima/à volta deste
 * H1 joga ele de novo para depois do footer no stream (bug 2026-06-27).
 */
function HomeIntroSync() {
  return (
    <section className="bg-cnc-bg">
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 md:pt-8">
        <h1 className="text-[24px] font-extrabold leading-[1.12] tracking-[-0.02em] text-[#1D2440] sm:text-[30px] md:text-[36px]">
          Compre e anuncie carros na sua região
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-7 text-[#5D667D] sm:text-[15px] md:text-[17px]">
          Encontre veículos por cidade, marca e modelo, compare preços com a FIPE e fale direto com
          vendedores próximos.
        </p>
      </div>
    </section>
  );
}

/** Skeleton do conteúdo pesado da Home (fallback do <Suspense>). */
function HomeContentSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-hidden="true">
      <div className="h-14 w-full rounded-2xl bg-black/5" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-44 rounded-2xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}

/**
 * Conteúdo pesado da Home (async) — toda resolução territorial + fetches vivem
 * AQUI, dentro do <Suspense> da `HomePage`. Pode suspender à vontade: o intro
 * síncrono já foi flushado no `<main>` antes do footer.
 *
 * Home — vitrine ESTADUAL.
 *   - A Home é sempre vitrine de UM estado (nunca cidade isolada nem Brasil).
 *   - Estado resolvido pelo TerritoryResolver: 1) `?state=UF`; 2) UF do cookie;
 *     3) default (SP). A cidade do cookie/query NÃO promove o nível para
 *     "city" — só inferi a UF e aparece como contexto secundário.
 */
async function HomeAsyncContent({ searchParams }: { searchParams: SearchParams }) {
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const queryState = getFirstParam(searchParams.state)?.trim() || null;
  const queryCitySlug = getFirstParam(searchParams.city_slug)?.trim() || null;

  const territory = await resolveTerritory({
    level: "state",
    cookie: fromCookie
      ? { slug: fromCookie.slug, state: fromCookie.state, name: fromCookie.name }
      : null,
    query: { city_slug: queryCitySlug, state: queryState },
  });

  const detectedCity =
    fromCookie?.slug && fromCookie?.name ? { slug: fromCookie.slug, name: fromCookie.name } : null;

  // Bloco "Explore por região" leve — só com flag on E regiões disponíveis.
  const regionalEnabled = isRegionalPageEnabled();

  const [aboveFold, stateRegionsPayload, heroBanners] = await Promise.all([
    fetchHomeAboveFold(),
    regionalEnabled ? fetchStateRegions(territory.state.code, { limit: 6 }) : Promise.resolve(null),
    fetchHomeHero(),
  ]);

  const stateRegions = stateRegionsPayload?.regions ?? [];
  const homeRegionsBlock =
    regionalEnabled && stateRegions.length > 0 ? (
      <StateRegionsBlock
        stateName={territory.state.name}
        regions={stateRegions}
        maxCards={6}
        variant="row"
      />
    ) : null;

  return (
    <HomePageClient
      data={aboveFold}
      stateUf={territory.state.code}
      stateName={territory.state.name}
      detectedCity={detectedCity}
      stateRegions={homeRegionsBlock}
      regionalEnabled={regionalEnabled}
      heroBanners={heroBanners}
      carousels={
        <HomeCarousels
          stateUf={territory.state.code}
          stateName={territory.state.name}
          detectedCityName={detectedCity?.name}
        />
      }
    />
  );
}

/**
 * HomePage — SÍNCRONA de propósito (NÃO tornar async).
 *
 * O shell síncrono garante que o H1/intro e o JSON-LD sejam flushados no
 * `<main>` ANTES do footer no HTML real (produção). Todo o trabalho assíncrono
 * (cookies, território, fetches) está isolado em <HomeAsyncContent> dentro do
 * <Suspense>, que pode streamar depois sem afetar a ordem semântica.
 *
 * `buildHomeJsonLd()` é síncrono (sem dados remotos), então roda aqui.
 */
export default function HomePage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const homeJsonLd = buildHomeJsonLd();

  return (
    <>
      {homeJsonLd.map((node, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}
      <HomeIntroSync />
      <Suspense fallback={<HomeContentSkeleton />}>
        <HomeAsyncContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
