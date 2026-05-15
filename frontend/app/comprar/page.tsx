import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  buildCityPath,
  buildStatePath,
  isValidCitySlug,
  normalizeUf,
  toReader,
  type SearchParams,
} from "@/lib/buy/territory-variant";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { parseAdsSearchFiltersFromSearchParams } from "@/lib/search/ads-search-url";
import {
  getDefaultTerritoryState,
  stateFromUf,
  ufFromCitySlug,
} from "@/lib/territory/territory-defaults";

/**
 * /comprar — router territorial.
 *
 * Política nova (substitui a "rodada de credibilidade", que renderizava
 * catálogo Brasil-todo aqui):
 *
 *   - A página estratégica para um usuário sem contexto é a vitrine
 *     ESTADUAL, não "Brasil". "Brasil-todo" foi descontinuado como produto:
 *     · canibalizava o canonical do estado;
 *     · não cumpria a hierarquia Estado → Região → Cidade;
 *     · gerava SEO genérico e UX vazia em estados de baixa liquidez.
 *
 *   - Comportamento:
 *       1. `?city_slug=X` válido → 307 para `/comprar/cidade/[slug]`.
 *       2. `?state=UF` válido    → 307 para `/comprar/estado/[uf]`.
 *       3. Sem território explícito → resolve estado via cookie/default e
 *          redireciona para `/comprar/estado/[uf]`. Filtros não-territoriais
 *          (q, brand, model, preço, etc.) são preservados na query string.
 *
 *   - Nunca há render direto desta rota. É um redirector puro.
 *     - Mantemos `variant="nacional"` em BuyMarketplacePageClient como
 *       fallback técnico para futuras telas de busca livre, mas nenhuma
 *       rota pública entra por aqui sem território.
 */

type ComprarPageProps = {
  searchParams?: SearchParams;
};

function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ComprarEntryPage({ searchParams = {} }: ComprarPageProps) {
  // 1. Território explícito → preserva canonical da cidade/estado.
  //    Usamos parser cru para não injetar `sort=recent`/`limit` default no
  //    redirect — manter exatamente os filtros do usuário.
  const rawFilters = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const citySlugFromUrl = (getFirstValue(searchParams.city_slug) || "").trim();
  if (citySlugFromUrl && isValidCitySlug(citySlugFromUrl)) {
    redirect(buildCityPath(citySlugFromUrl, rawFilters));
  }

  const ufFromUrl = normalizeUf(getFirstValue(searchParams.state));
  if (ufFromUrl) {
    redirect(buildStatePath(ufFromUrl, rawFilters));
  }

  // 2. Sem território explícito → resolve UF via cookie ou default.
  //    Cookie da cidade do usuário (cnc_city) carrega o `state` já gravado,
  //    com fallback inferido do slug. Sem cookie, cai no estado padrão (SP).
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const cookieUf =
    (fromCookie?.state || "").toUpperCase() || ufFromCitySlug(fromCookie?.slug ?? null);
  const resolvedUf =
    (cookieUf && stateFromUf(cookieUf)?.code) || getDefaultTerritoryState().code;

  redirect(buildStatePath(resolvedUf, rawFilters));
}
