import { cookies } from "next/headers";

import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import type { StateCuratedCity } from "@/lib/buy/state-territorial-cities";
import { fetchRegionByCitySlug } from "@/lib/regions/fetch-region";
import type { StateRegionSummary } from "@/lib/territory/fetch-state-regions";

/**
 * Helper SSR para resolver o contexto territorial usado pelo sub-bloco
 * "Cidades próximas de [cidade]" do StateTerritorialShortcuts (briefing
 * 2026-05-21 item 12).
 *
 * Estratégia em dois estágios (preferindo o mais barato):
 *
 *   1. **Match na amostra já em mãos** — tenta achar a cidade do cookie
 *      dentro de `regions` (que a página estadual já buscou para
 *      `StateRegionsBlock`). Quando a cidade do visitante por acaso é
 *      base de uma das 8 regiões em destaque, isso resolve sem
 *      roundtrip extra.
 *
 *   2. **Fetch dedicado da Região por slug** — quando o passo 1 não
 *      acha (cenário comum: cidade do visitante não está entre as 8
 *      regiões alfabeticamente primeiras), chama
 *      `fetchRegionByCitySlug(citySlug)`. Esse BFF tem cache 15 min e
 *      degrada para `null` em qualquer falha, então é seguro pagar.
 *
 * Política:
 *  - Sem cookie → sem contexto, retorna `null` (caller mostra só o
 *    fallback "Principais cidades em [estado]").
 *  - Cookie de UF diferente da página → ignora (não faria sentido
 *    sugerir cidades próximas de Belo Horizonte em /carros-usados/sp).
 *  - Tudo é tolerante a falha — qualquer erro vira `null` e a página
 *    cai para o fallback.
 */
export type StateNearbyContext = {
  /** Nome de exibição da cidade detectada (ex.: "Atibaia"). */
  activeCityName: string;
  /** Cidades da mesma região (incluindo a cidade-base). */
  nearbyCities: StateCuratedCity[];
};

export async function resolveStateNearbyContext(
  uf: string,
  regions: StateRegionSummary[] | null | undefined
): Promise<StateNearbyContext | null> {
  const ufUpper = String(uf || "").trim().toUpperCase();
  if (ufUpper.length !== 2) return null;

  const cookieValue = cookies().get(CITY_COOKIE_NAME)?.value;
  const cityRef = parseCityCookieValue(cookieValue);
  if (!cityRef) return null;

  // Cookie de outra UF não vale aqui — a Página Estadual é por estado.
  if (cityRef.state.toUpperCase() !== ufUpper) return null;

  const citySlug = cityRef.slug.toLowerCase();

  // Estágio 1: tenta resolver sem custo extra a partir da amostra que
  // a página já carregou.
  const matchingRegion = regions?.find((r) =>
    r.citySlugs.some((s) => s.toLowerCase() === citySlug)
  );
  if (matchingRegion) {
    const nearbyCities: StateCuratedCity[] = matchingRegion.citySlugs.map(
      (slug, idx) => ({
        slug,
        name: matchingRegion.cityNames[idx] || slug,
      })
    );
    if (nearbyCities.length > 0) {
      return { activeCityName: cityRef.name, nearbyCities };
    }
  }

  // Estágio 2: fetch dedicado por slug de cidade. Pago só quando a
  // amostra não cobriu — degrade gracioso (`null`) cobre qualquer falha.
  const regionPayload = await fetchRegionByCitySlug(citySlug);
  if (!regionPayload) return null;

  const members = Array.isArray(regionPayload.members) ? regionPayload.members : [];
  const nearbyCities: StateCuratedCity[] = [
    {
      slug: regionPayload.base.slug,
      name: regionPayload.base.name,
    },
    ...members
      // Defesa: só inclui membros do mesmo estado (consistência com
      // a Página Estadual que está sendo renderizada).
      .filter((m) => String(m.state || "").toUpperCase() === ufUpper)
      .map((m) => ({ slug: m.slug, name: m.name })),
  ];

  // De-dup por slug preservando ordem (a base aparece primeiro).
  const seen = new Set<string>();
  const dedup: StateCuratedCity[] = [];
  for (const c of nearbyCities) {
    const key = c.slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(c);
  }

  if (dedup.length === 0) return null;
  return { activeCityName: cityRef.name, nearbyCities: dedup };
}
