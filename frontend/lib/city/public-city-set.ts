/**
 * Conjunto de cidades públicas, do lado do frontend.
 *
 *   "Uma cidade só existe a partir do momento em que um anunciante publica um
 *    anúncio nela."
 *
 * Ver `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`.
 *
 * Este módulo existe para os GERADORES DE LINK. O gate do middleware tem a sua
 * própria cópia (`lib/middleware/city-existence-gate.ts`) porque roda no Edge e
 * não pode importar helpers de Node — mas os dois consomem o MESMO endpoint,
 * que consome a MESMA função no backend. Um só lugar decide.
 *
 * Sem isto, trocaríamos 11 mil páginas indexáveis por 11 mil links quebrados —
 * pior que o problema original.
 */

import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";

export type PublicCitySet = {
  cities: Record<string, number>;
  total: number;
  existsMinAds: number;
  indexMinAds: number;
};

const EMPTY: PublicCitySet = { cities: {}, total: 0, existsMinAds: 1, indexMinAds: 3 };

/**
 * Busca o conjunto. `null` (e não conjunto vazio) quando o backend está
 * indisponível — o caller precisa distinguir "nenhuma cidade tem anúncio" de
 * "não consegui saber". Tratar falha como conjunto vazio esconderia todos os
 * links do site numa queda de backend.
 */
export async function fetchPublicCitySet(revalidateSeconds = 60): Promise<PublicCitySet | null> {
  const url = resolveInternalBackendApiUrl("/api/public/cities/public-set");
  if (!url) return null;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...buildInternalBackendHeaders() },
      next: { revalidate: revalidateSeconds, tags: ["public-city-set"] },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { data?: Partial<PublicCitySet> } | null;
    const cities = json?.data?.cities;
    if (!cities || typeof cities !== "object" || Array.isArray(cities)) return null;

    return {
      cities: cities as Record<string, number>,
      total: Number(json?.data?.total) || Object.keys(cities).length,
      existsMinAds: Number(json?.data?.existsMinAds) || EMPTY.existsMinAds,
      indexMinAds: Number(json?.data?.indexMinAds) || EMPTY.indexMinAds,
    };
  } catch {
    return null;
  }
}

/** Normalização única do slug — evita que cada caller invente a sua. */
export function normalizeCitySlug(slug: unknown): string {
  return String(slug ?? "")
    .trim()
    .toLowerCase();
}

export function isPublicCity(set: PublicCitySet | null, slug: unknown): boolean {
  if (!set) return false;
  const key = normalizeCitySlug(slug);
  return key ? Object.prototype.hasOwnProperty.call(set.cities, key) : false;
}

export function publicCityAdCount(set: PublicCitySet | null, slug: unknown): number {
  if (!set) return 0;
  return Number(set.cities[normalizeCitySlug(slug)]) || 0;
}

/**
 * Filtra uma lista de cidades ao conjunto público.
 *
 * `set === null` (backend indisponível) devolve a lista INTACTA, não vazia:
 * numa queda de backend é melhor mostrar links que podem 404 do que apagar a
 * navegação do site inteiro. Mesma política de fail-open do gate.
 */
export function filterToPublicCities<T>(
  set: PublicCitySet | null,
  items: T[],
  getSlug: (item: T) => unknown
): T[] {
  if (!set) return items;
  return items.filter((item) => isPublicCity(set, getSlug(item)));
}
