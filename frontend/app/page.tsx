// frontend/app/page.tsx
import { cookies } from "next/headers";

import { HomePageClient } from "@/components/home/HomePageClient";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { DEFAULT_CITY } from "@/lib/city/city-default";
import { fetchCityMetaBySlug } from "@/lib/city/fetch-city-meta-server";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { fetchPublicHomeData } from "@/lib/home/public-home";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

export const revalidate = 300;

type SearchParams = Record<string, string | string[] | undefined>;

function getFirstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function HomePage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const fromQuery = getFirstParam(searchParams.city_slug)?.trim();

  const activeSlug = fromQuery || fromCookie?.slug || DEFAULT_PUBLIC_CITY_SLUG;

  const resolved =
    fromQuery && (!fromCookie || fromCookie.slug !== fromQuery)
      ? await fetchCityMetaBySlug(fromQuery)
      : null;

  const cityIdForHome =
    resolved?.id ?? (fromCookie?.slug === activeSlug ? fromCookie.id : undefined);

  const data = await fetchPublicHomeData(activeSlug, cityIdForHome);

  const featuredName = data.featuredCities?.find((c) => c.slug === activeSlug)?.name;

  const activeCityName =
    featuredName ||
    resolved?.name ||
    (fromCookie?.slug === activeSlug ? fromCookie.name : null) ||
    DEFAULT_CITY.name;
  const activeCitySlug = activeSlug;

  return (
    <HomePageClient data={data} activeCitySlug={activeCitySlug} activeCityName={activeCityName} />
  );
}
