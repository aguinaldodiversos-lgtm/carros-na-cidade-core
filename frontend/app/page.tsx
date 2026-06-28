// frontend/app/page.tsx
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

/**
 * `force-dynamic` (correção de ordem semântica/SSR 2026-06-27).
 *
 * O root layout usa `cookies()`/`headers()` → toda rota já é dinâmica (ƒ).
 * Com `export const revalidate`, o Next fazia prerender parcial: shell
 * estático (header + FOOTER) + corpo do `<main>` (incl. H1/proposta)
 * transmitido DEPOIS do footer, num Suspense vazio. Crawler via o rodapé
 * antes do conteúdo principal. `force-dynamic` renderiza inline (H1 antes
 * do footer). Carrosséis seguem em <Suspense> próprio (streaming preservado).
 * Mesmo padrão de `/carros-em/[slug]`.
 */
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getFirstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Home — vitrine ESTADUAL.
 *
 * Política territorial:
 *   - A Home é a entrada do portal e é sempre vitrine de UM estado, nunca
 *     de uma cidade isolada nem do Brasil inteiro. Isso é deliberado:
 *       · Cidade isolada (ex: SP capital) zerava o inventário visível.
 *       · Brasil-todo nivelava sinal SEO e produzia página genérica.
 *   - O estado é resolvido pelo TerritoryResolver com prioridade:
 *       1. `?state=UF` na query.
 *       2. Estado da cidade do cookie (cookie_city.slug → UF inferida).
 *       3. Default (SP, overridable por NEXT_PUBLIC_DEFAULT_STATE_UF).
 *   - A cidade do cookie/query NÃO promove o nível para "city" no Home —
 *     ela só inferi a UF e aparece como contexto secundário ("você está em
 *     Atibaia, ver carros próximos?"). O usuário só vê uma vitrine de
 *     cidade ao navegar para `/comprar/cidade/[slug]` ou
 *     `/carros-usados/regiao/[slug]`.
 */
export default async function HomePage({ searchParams = {} }: { searchParams?: SearchParams }) {
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

  // Bloco "Explore por região" leve na Home — só renderiza com regional
  // flag on E com regiões disponíveis no endpoint. Quando flag está off,
  // não há link clicável que faça sentido (cairia em 404), então não
  // fazemos fetch.
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

  // Fase 4.3 (§8) — JSON-LD da Home (WebSite + SearchAction + Organization).
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
      {/*
        Intro SEO síncrono (server-rendered). Fica ANTES do <HomePageClient>
        (client) para garantir que o H1 e a proposta principal apareçam no
        `<main>` no flush inicial — antes de busca, regiões, carrosséis e do
        footer. Sem isso, o primeiro conteúdo era "Buscar veículos"/"Explore
        por região", e o Google puxava snippets regionais aleatórios. Bloco
        discreto, visível, sem texto escondido e integrado ao layout.
      */}
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
    </>
  );
}
