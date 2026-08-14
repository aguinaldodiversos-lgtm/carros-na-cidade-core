/**
 * Regras compartilhadas entre as páginas de catálogo "Comprar Estadual" e
 * "Comprar na Cidade".
 *
 * Fonte de verdade:
 *  - Estadual  => `filters.state` (UF), NUNCA `city_slug` / `city_id` / `city`
 *  - Cidade    => `filters.city_slug`, NUNCA `state` / `city_id` / `city` isolados
 *
 * Mantemos estes helpers num só lugar para evitar divergência entre rotas.
 */

import type { BuyCityContext } from "@/lib/buy/catalog-helpers";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import type { CityRef } from "@/lib/city/city-types";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import {
  buildSearchQueryString,
  DEFAULT_COMPRAR_CATALOG_LIMIT,
  mergeSearchFilters,
  parseAdsSearchFiltersFromSearchParams,
} from "@/lib/search/ads-search-url";
import { getCanonicalCityPath, isValidCanonicalCitySlug } from "@/lib/seo/canonical-city-path";

/**
 * Variantes da página /comprar.
 *
 * - `estadual`: catálogo de um UF (`/comprar/estado/[uf]`, alias da canônica
 *   `/carros-usados/[uf]`).
 * - `cidade`: catálogo de uma cidade (`/carros-em/[slug]`, canônica).
 * - `regional`: catálogo da região de uma cidade-base
 *   (`/carros-usados/regiao/[slug]`). Inclui a cidade-base + cidades
 *   próximas dentro do raio configurável; cidade-base prioriza só
 *   dentro do mesmo tier comercial (briefing 2026-05-20).
 * - `nacional`: catálogo do Brasil inteiro — a rota `/comprar`. NÃO é mais
 *   "fallback técnico sem rota pública": desde o hotfix de 2026-08-13,
 *   `/comprar` é a vitrine nacional TRANSACIONAL (busca + filtros + cards +
 *   paginação), servida por `normalizeNationalFilters` + `loadNationalCatalogData`.
 *
 * ── Correção documental (2026-08-13) ─────────────────────────────────────────
 * Este comentário afirmava que `/comprar` "sempre redireciona para estadual ou
 * cidade", resolvendo a UF por cookie/default. Isso deixou de ser verdade
 * quando `/comprar` virou destino final (200 autocanônico) — e a descrição
 * desatualizada é exatamente o tipo de sinal que faz alguém reintroduzir o
 * redirect por território. Não existe fallback territorial em `/comprar`:
 * sem UF, sem cidade, sem cookie. O território é o Brasil.
 */
export type ComprarVariant = "estadual" | "cidade" | "regional" | "nacional";

export type SearchParams = Record<string, string | string[] | undefined>;

export type { BuyCityContext };

export function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function toReader(searchParams: SearchParams) {
  return {
    get(name: string) {
      return getFirstValue(searchParams[name]);
    },
  };
}

export function normalizeUf(raw: string | null | undefined): string | null {
  const value = (raw || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return null;
  return BRAZIL_UFS.some((uf) => uf.value === value) ? value : null;
}

export function stateNameFromUf(uf: string): string {
  return BRAZIL_UFS.find((entry) => entry.value === uf)?.label ?? uf;
}

export function isValidCitySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const parts = String(slug).trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return false;
  const uf = parts[parts.length - 1];
  return /^[a-z]{2}$/.test(uf);
}

/**
 * Slug territorial de cidade VÁLIDO: além do formato `nome-uf`
 * (`isValidCitySlug`), exige que a UF final seja uma UF brasileira REAL.
 * Sem o segundo teste, "cidade-falsa-xx" passaria o regex, cairia no fetch,
 * voltaria vazia e produziria soft-404 (HTTP 200 indexável).
 *
 * É a fonte única de verdade usada por `/carros-em`, `/carros-baratos-em`,
 * `/carros-automaticos-em` e `/tabela-fipe` para comitar 404 real em cidade
 * inexistente (auditoria SEO 2026-05-21 / 2026-07-03). NÃO valida existência
 * no catálogo: cidade real SEM anúncios continua válida (200 + fallback) —
 * o 404 é só para entidade que NÃO EXISTE.
 *
 * A implementação foi movida para `lib/seo/canonical-city-path.ts`, junto da
 * montagem da URL canônica, porque "este slug é uma cidade?" e "qual é a URL
 * dessa cidade?" precisam responder sobre o MESMO conjunto. Enquanto eram duas
 * implementações, uma rota podia aceitar um slug que a outra recusava. Este
 * nome continua exportado: é o que o resto do portal importa.
 */
export function isValidBrazilianCitySlug(slug: string | null | undefined): boolean {
  return isValidCanonicalCitySlug(slug);
}

function normalizeWord(word: string) {
  const lower = word.toLowerCase();
  const dictionary: Record<string, string> = {
    sao: "São",
    joao: "João",
    jose: "José",
    conceicao: "Conceição",
    assuncao: "Assunção",
    caxias: "Caxias",
  };
  if (dictionary[lower]) return dictionary[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function cityContextFromSlug(slug: string): BuyCityContext {
  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && /^[A-Z]{2}$/.test(ufCandidate));

  const cityName = parts
    .slice(0, hasUf ? -1 : undefined)
    .map(normalizeWord)
    .join(" ");

  const name = cityName || "Cidade";
  const state = hasUf ? ufCandidate! : "SP";

  return {
    name,
    state,
    slug,
    label: `${name} (${state})`,
  };
}

export function cityContextFromRef(ref: CityRef | null | undefined): BuyCityContext | null {
  if (!ref?.slug) return null;
  return {
    name: ref.name,
    state: ref.state,
    slug: ref.slug,
    label: `${ref.name} (${ref.state})`,
  };
}

/**
 * True quando os filtros recortam o catálogo — ou seja, a URL NÃO é a vitrine
 * canônica limpa. Usado em `generateMetadata` para emitir `robots: noindex`
 * nessas variantes (a canonical consolida; o noindex é o sinal explícito).
 *
 * Auditoria 2026-08-06: faltavam `seller_kind`, `opportunity` e
 * `priority_tier` — os três filtros da Fase 3. Cada valor deles produzia uma
 * página `index,follow` com canonical autorreferente, exatamente a duplicata
 * que esta função existe para impedir. Mesmo padrão de esquecimento já
 * registrado em `hasFilters`, `countQuery`, chave de cache e chips.
 *
 * A lista de nomes de PARÂMETRO vive em `lib/seo/query-policy.ts`; aqui
 * trabalhamos sobre `AdsSearchFilters` (já parseado), então a checagem é por
 * campo. Ao acrescentar filtro novo, os dois lugares mudam no mesmo PR.
 */
export function hasRestrictiveFilters(filters: AdsSearchFilters): boolean {
  return Boolean(
    filters.q ||
      filters.brand ||
      filters.model ||
      filters.min_price ||
      filters.max_price ||
      filters.year_min ||
      filters.year_max ||
      filters.mileage_max ||
      filters.fuel_type ||
      filters.transmission ||
      filters.body_type ||
      filters.below_fipe === true ||
      filters.highlight_only === true ||
      filters.opportunity === true ||
      filters.seller_kind ||
      filters.priority_tier
  );
}

/**
 * Normaliza filtros para o catálogo estadual:
 * - força UF;
 * - remove qualquer resquício de território de cidade;
 * - aplica defaults de sort/page/limit coerentes com /comprar.
 *
 * Default `sort="relevance"` (briefing 2026-05-20): a ordenação canônica
 * das páginas territoriais é "Mais relevantes" — combina peso comercial,
 * proximidade da cidade-base, oportunidade, abaixo da FIPE, qualidade e
 * recência. Trocar pra "recent" como default enfraqueceria a monetização
 * (Destaque/Pro perderiam topo da SERP interna).
 */
export function normalizeStateFilters(uf: string, searchParams: SearchParams): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const sortInQuery = getFirstValue(searchParams.sort);
  const hasExplicitSort = sortInQuery != null && String(sortInQuery).trim() !== "";

  const next: AdsSearchFilters = {
    ...parsed,
    state: uf,
    sort: hasExplicitSort ? parsed.sort || "relevance" : "relevance",
    page: parsed.page || 1,
    limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
  };

  delete next.city_slug;
  delete next.city_id;
  delete next.city;

  return next;
}

/**
 * Normaliza filtros para o catálogo NACIONAL (`/comprar`).
 *
 * O contrário dos dois normalizadores territoriais: em vez de FORÇAR um
 * território, este REMOVE todos. O Brasil não é "um estado grande" — é a
 * ausência de recorte territorial, e é isso que o backend precisa receber.
 *
 * ── Por que apagar em vez de só não preencher ────────────────────────────────
 * `parseAdsSearchFiltersFromSearchParams` lê `state`, `city_slug`, `city_id`,
 * `city` e `city_slugs` da query. Se um deles sobrevivesse, `/comprar?state=SP`
 * renderizaria o catálogo de SP sob a URL nacional — a mesma doorway page que
 * `/comprar/cidade` já custou para remover. As grafias legadas com território
 * na query saem antes, com 308 real, no `decideComprarLegacyQueryRedirect`;
 * este delete é a segunda linha, para o caso de a query chegar aqui de outro
 * jeito (rewrite interno, chamada direta do loader em teste).
 *
 * Nenhum default entra no lugar: não há UF de cookie, não há "primeira cidade
 * do banco", não há SP. Estoque concentrado numa cidade não redefine a
 * identidade da rota.
 *
 * `sort`/`page`/`limit` seguem os MESMOS defaults das vitrines territoriais —
 * é o mesmo catálogo, só sem recorte.
 */
export function normalizeNationalFilters(searchParams: SearchParams): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const sortInQuery = getFirstValue(searchParams.sort);
  const hasExplicitSort = sortInQuery != null && String(sortInQuery).trim() !== "";

  const next: AdsSearchFilters = {
    ...parsed,
    sort: hasExplicitSort ? parsed.sort || "relevance" : "relevance",
    page: parsed.page || 1,
    limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
  };

  delete next.state;
  delete next.city_slug;
  delete next.city_slugs;
  delete next.city_id;
  delete next.city;

  return next;
}

/**
 * Normaliza filtros para o catálogo da cidade:
 * - força city_slug;
 * - remove state/city/city_id (evita AND redundante que pode zerar resultados);
 * - default `sort="relevance"` (ver nota em `normalizeStateFilters`).
 */
export function normalizeCityFilters(
  citySlug: string,
  searchParams: SearchParams
): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const sortInQuery = getFirstValue(searchParams.sort);
  const hasExplicitSort = sortInQuery != null && String(sortInQuery).trim() !== "";

  const next: AdsSearchFilters = {
    ...parsed,
    city_slug: citySlug,
    sort: hasExplicitSort ? parsed.sort || "relevance" : "relevance",
    page: parsed.page || 1,
    limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
  };

  delete next.state;
  delete next.city;
  delete next.city_id;

  return next;
}

/**
 * Query string só com filtros não-territoriais, para cross-links entre rotas
 * e para os `href` da paginação.
 *
 * `limit` sai junto (auditoria 2026-08-07). `normalizeCityFilters` sempre
 * preenche `filters.limit` com o default, então esta função vinha emitindo
 * `limit=50` em TODO link de paginação — uma segunda grafia de cada página do
 * catálogo, gerada pela própria navegação interna. E como não existe controle
 * de tamanho de página na UI, `limit` nunca representa escolha do usuário que
 * valha propagar. Ver `DEFAULT_CATALOG_LIMIT` em `lib/seo/query-policy.ts`.
 */
export function buildNonTerritoryQueryString(filters: AdsSearchFilters): string {
  const clone: AdsSearchFilters = { ...filters };
  delete clone.state;
  delete clone.city;
  delete clone.city_id;
  delete clone.city_slug;
  delete clone.page;
  delete clone.limit;
  return buildSearchQueryString(clone);
}

export function buildStatePath(uf: string, filters?: AdsSearchFilters): string {
  const base = `/comprar/estado/${uf.toLowerCase()}`;
  if (!filters) return base;
  const qs = buildNonTerritoryQueryString(filters);
  return qs ? `${base}?${qs}` : base;
}

/**
 * URL de destino de "ver os carros desta cidade".
 *
 * Passou a devolver a CANÔNICA `/carros-em/[slug]` (antes:
 * `/comprar/cidade/[slug]`). Todo chamador — o redirector `/comprar`, o
 * `GeoToCityRedirect`, o seletor de cidade — aterrissa direto no destino final,
 * sem o salto intermediário que gastava crawl budget e dividia o sinal entre
 * duas URLs do mesmo recurso.
 *
 * Slug inválido devolve `null`: sem cidade não há página de cidade, e escolher
 * uma cidade "padrão" aqui seria fabricar doorway page. Quem chama trata.
 */
export function buildCityPath(citySlug: string, filters?: AdsSearchFilters): string | null {
  const base = getCanonicalCityPath(citySlug);
  if (!base) return null;
  if (!filters) return base;
  const qs = buildNonTerritoryQueryString(filters);
  return qs ? `${base}?${qs}` : base;
}

export { mergeSearchFilters };
