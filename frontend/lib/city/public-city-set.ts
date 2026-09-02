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

/**
 * Cidade pública PRIMÁRIA — a resposta a "se eu precisar de UMA cidade, qual?".
 *
 * Calculada no backend (`public-city-set.service.js#pickPrimaryPublicCity`) a
 * partir da mesma passagem que monta `cities`: maior estoque ativo, empate por
 * slug ASC. `null` quando não há nenhuma cidade pública.
 *
 * NÃO derivar de `Object.keys(cities)[0]`: a ordem de chaves de objeto não é
 * contrato, e o consumidor não pode depender de acidente de serialização.
 */
export type PrimaryPublicCity = {
  slug: string;
  uf: string | null;
  activeAds: number;
};

export type PublicCitySet = {
  cities: Record<string, number>;
  total: number;
  existsMinAds: number;
  indexMinAds: number;
  /** `null` quando o portal não tem nenhuma cidade com estoque ativo. */
  primaryCity: PrimaryPublicCity | null;
};

const EMPTY: PublicCitySet = {
  cities: {},
  total: 0,
  existsMinAds: 1,
  indexMinAds: 3,
  primaryCity: null,
};

/** `"sao-jose-dos-campos-sp"` → `"SP"`. Vazio quando o slug não tem sufixo. */
function ufFromSlug(slug: string): string | null {
  const parts = slug.split("-").filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].toUpperCase();
  return /^[A-Z]{2}$/.test(last) ? last : null;
}

/**
 * Deriva a cidade primária do próprio mapa `cities`, com a MESMA regra do
 * backend: maior estoque ativo, empate por slug ASC.
 *
 * ── Por que existe, se o backend já calcula ──────────────────────────────────
 * Para o frontend não depender da ORDEM DO DEPLOY. Medido em 2026-09-01: com o
 * backend ainda na versão anterior (sem `primaryCity`), `/tabela-fipe`
 * redirecionava para `/comprar` em vez de `/tabela-fipe/atibaia-sp` — degradação
 * correta, mas desnecessária, e que duraria até o backend subir.
 *
 * Não é uma segunda fonte de verdade nem uma consulta nova: é uma redução do
 * mesmo payload que já veio, com a mesma regra escrita ao lado. O campo do
 * backend continua tendo precedência quando existe.
 */
function derivePrimaryCity(cities: Record<string, number>): PrimaryPublicCity | null {
  let best: PrimaryPublicCity | null = null;

  for (const [rawSlug, rawTotal] of Object.entries(cities || {})) {
    const slug = normalizeCitySlug(rawSlug);
    const activeAds = Number(rawTotal) || 0;
    if (!slug || activeAds <= 0) continue;

    if (
      !best ||
      activeAds > best.activeAds ||
      (activeAds === best.activeAds && slug.localeCompare(best.slug) < 0)
    ) {
      best = { slug, uf: ufFromSlug(slug), activeAds };
    }
  }

  return best;
}

/**
 * Lê `primaryCity` do payload sem confiar nele.
 *
 * Se o backend emitir um slug que NÃO está no próprio mapa `cities`, recusamos:
 * o campo é conveniência derivada, nunca uma segunda fonte de verdade sobre
 * quais cidades existem. Campo ausente ou inválido cai na derivação local.
 */
function parsePrimaryCity(raw: unknown, cities: Record<string, number>): PrimaryPublicCity | null {
  if (raw && typeof raw === "object") {
    const candidate = raw as Partial<PrimaryPublicCity>;
    const slug = normalizeCitySlug(candidate.slug);

    if (slug && Object.prototype.hasOwnProperty.call(cities, slug)) {
      const uf = String(candidate.uf ?? "")
        .trim()
        .toUpperCase();

      return {
        slug,
        uf: /^[A-Z]{2}$/.test(uf) ? uf : ufFromSlug(slug),
        activeAds: Number(cities[slug]) || 0,
      };
    }
  }

  return derivePrimaryCity(cities);
}

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

    const cityMap = cities as Record<string, number>;

    return {
      cities: cityMap,
      total: Number(json?.data?.total) || Object.keys(cityMap).length,
      existsMinAds: Number(json?.data?.existsMinAds) || EMPTY.existsMinAds,
      indexMinAds: Number(json?.data?.indexMinAds) || EMPTY.indexMinAds,
      primaryCity: parsePrimaryCity(json?.data?.primaryCity, cityMap),
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
