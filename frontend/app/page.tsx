// frontend/app/page.tsx
import { Suspense } from "react";
import { cookies } from "next/headers";

import { HomePageClient } from "@/components/home/HomePageClient";
import { HomeCarousels } from "@/components/home/sections/HomeCarousels";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { fetchHomeDiscovery } from "@/lib/home/home-discovery";
import { fetchHomeAboveFold, fetchHomeHero } from "@/lib/home/public-home";
import { buildHomeJsonLd } from "@/lib/seo/home-structured-data";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getFirstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * H1 SÍNCRONO da Home — componente server 100% síncrono: SEM await, SEM
 * fetch, SEM client component, SEM Suspense. É renderizado pela `HomePage`
 * (também síncrona) ANTES do <Suspense> do conteúdo pesado, então o H1 entra
 * no `<main>` no PRIMEIRO flush do HTML — antes do footer.
 *
 * Reestruturação 2026-07-11: o antigo "Hero" textual (título visível +
 * subtítulo) foi REMOVIDO. A Home passa a abrir pelo carrossel de banners.
 * Para não perder o H1 (sinal de SEO), mantemos aqui um H1 VISUALMENTE
 * OCULTO (`sr-only`) — presente no HTML e lido por leitores de tela, sem
 * ocupar espaço na tela.
 *
 * CRÍTICO: NÃO tornar async, NÃO mover para dentro de componente async/
 * Suspense e NÃO depender de dados remotos. Qualquer await acima/à volta deste
 * H1 joga ele de novo para depois do footer no stream (bug 2026-06-27).
 */
function HomeIntroSync() {
  return <h1 className="sr-only">Compre e anuncie carros na sua região</h1>;
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

  // Flag regional — usada pelo LocationRegionalPrompt (seção Localização).
  // O antigo bloco "Explore por região" foi removido na reestruturação
  // 2026-07-11 (substituído pelo bloco SEO "Continue sua busca").
  const regionalEnabled = isRegionalPageEnabled();

  const [aboveFold, heroBanners, discovery] = await Promise.all([
    fetchHomeAboveFold(),
    fetchHomeHero(),
    fetchHomeDiscovery(territory.state.code),
  ]);

  return (
    <HomePageClient
      data={aboveFold}
      stateUf={territory.state.code}
      stateName={territory.state.name}
      detectedCity={detectedCity}
      regionalEnabled={regionalEnabled}
      heroBanners={heroBanners}
      profiles={discovery.profiles}
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
