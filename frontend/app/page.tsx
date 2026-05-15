// frontend/app/page.tsx
import { cookies } from "next/headers";

import { HomePageClient } from "@/components/home/HomePageClient";
import { HomeCarousels } from "@/components/home/sections/HomeCarousels";
import { StateRegionsBlock } from "@/components/territorial/StateRegionsBlock";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { fetchHomeAboveFold } from "@/lib/home/public-home";
import { fetchStateRegions } from "@/lib/territory/fetch-state-regions";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

export const revalidate = 300;

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
    fromCookie?.slug && fromCookie?.name
      ? { slug: fromCookie.slug, name: fromCookie.name }
      : null;

  // Bloco "Explore por região" leve na Home — só renderiza com regional
  // flag on E com regiões disponíveis no endpoint. Quando flag está off,
  // não há link clicável que faça sentido (cairia em 404), então não
  // fazemos fetch.
  const regionalEnabled = isRegionalPageEnabled();

  const [aboveFold, stateRegionsPayload] = await Promise.all([
    fetchHomeAboveFold(),
    regionalEnabled
      ? fetchStateRegions(territory.state.code, { limit: 6 })
      : Promise.resolve(null),
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
