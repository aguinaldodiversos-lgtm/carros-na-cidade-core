import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import {
  buildCityPath,
  buildStatePath,
  cityContextFromRef,
  isValidCitySlug,
  normalizeUf,
  type SearchParams,
} from "@/lib/buy/territory-variant";
import { parseAdsSearchFiltersFromSearchParams } from "@/lib/search/ads-search-url";
import { getPublicDefaultCity } from "@/lib/site/public-config";

export const revalidate = 0;

/**
 * /comprar é o ponto de entrada do funil.
 *
 * Regras:
 *  1. se a URL já aponta território (city_slug, state) => redireciona para a rota canônica;
 *  2. se o visitante tem cookie de cidade confirmada => leva direto para Comprar na Cidade;
 *  3. fallback => Comprar Estadual do estado público padrão (SP por default).
 *
 * Isto garante que cada página (Estadual / Cidade) tem fonte de verdade única
 * e que nenhuma URL antiga quebra: as searchParams não-territoriais são preservadas.
 */
export default async function ComprarEntryPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const parsed = parseAdsSearchFiltersFromSearchParams({
    get: (name) => {
      const raw = searchParams[name];
      if (Array.isArray(raw)) return raw[0] ?? null;
      return raw ?? null;
    },
  });

  // 1. território explícito na URL vence qualquer preferência salva.
  const citySlugFromUrl = parsed.city_slug?.trim();
  if (citySlugFromUrl && isValidCitySlug(citySlugFromUrl)) {
    redirect(buildCityPath(citySlugFromUrl, parsed));
  }

  const ufFromUrl = normalizeUf(parsed.state);
  if (ufFromUrl) {
    redirect(buildStatePath(ufFromUrl, parsed));
  }

  // 2. cidade conhecida por cookie => Comprar na Cidade.
  const cookieStore = await cookies();
  const cookieCity = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const preferred = cityContextFromRef(cookieCity);
  if (preferred && isValidCitySlug(preferred.slug)) {
    redirect(buildCityPath(preferred.slug, parsed));
  }

  // 3. sem contexto => Comprar Estadual do UF default.
  const fallbackUf = normalizeUf(getPublicDefaultCity().state) || "SP";
  redirect(buildStatePath(fallbackUf, parsed));
}
