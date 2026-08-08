/**
 * Política ÚNICA de query string para as vitrines de catálogo.
 *
 * O problema que ela resolve: cada rota decidia sozinha o que fazer com
 * `?sort=`, `?page=`, `?raio=`, `?utm_source=`. O resultado é que a mesma
 * cidade existia para o Google em dezenas de variantes — algumas `index`,
 * outras `noindex`, e nenhuma delas concordando sobre qual é a canônica.
 * `hasRestrictiveFilters` conhecia onze parâmetros; o catálogo já usava vinte.
 * Os filtros da Fase 3 (`seller_kind`, `opportunity`, `priority_tier`) e o raio
 * (`raio`/`radius`) não estavam na conta, então `/carros-em/atibaia-sp?raio=25`
 * respondia `index,follow` com canonical autorreferente — uma página indexável
 * a mais por valor de filtro.
 *
 * A tabela abaixo é a fonte de verdade. Parâmetro novo no catálogo entra AQUI,
 * no mesmo PR — é o mesmo tipo de esquecimento que já mordeu duas vezes.
 *
 * ── As quatro categorias ─────────────────────────────────────────────────────
 *
 *   sorting     `?sort=` — reordena o MESMO conjunto. Não é página nova.
 *               noindex,follow + canonical limpa. Quando o valor é o default
 *               (`relevance`), a URL é normalizada por redirect: não existe
 *               diferença entre pedir a ordenação padrão e não pedir nada.
 *
 *   pagination  `?page=` — a única categoria que gera página PRÓPRIA. Página
 *               2+ tem canonical autorreferente e é indexável: canonicalizar
 *               tudo para a página 1 esconderia do índice os anúncios do fim
 *               da lista, que é justamente o acervo antigo. `page=1` (e
 *               qualquer valor inválido) é normalizado por redirect para a URL
 *               limpa. `limit` acompanha a categoria mas nunca é canônico.
 *
 *   filter      recorte arbitrário do conjunto. Continua funcionando para o
 *               usuário — só não entra no índice: noindex,follow + canonical
 *               para a URL territorial limpa. É por isso que estes parâmetros
 *               NÃO podem ser bloqueados no robots.txt: o Google precisa
 *               conseguir buscar a página para ler o noindex e a canonical.
 *
 *   tracking    não muda o conteúdo. Página acessível, robots INALTERADO,
 *               canonical limpa. Não normalizamos por redirect: um 308 que
 *               descarta `utm_*` apagaria a atribuição da campanha.
 *
 *   territory   território vive no PATH. Se apareceu na query, é resquício de
 *               URL legada; a rota trata (redirect), não esta política.
 */

/** Ordenação default das vitrines territoriais (ver `normalizeCityFilters`). */
export const DEFAULT_CATALOG_SORT = "relevance";

/**
 * Tamanho de página default do catálogo. Espelha `DEFAULT_COMPRAR_CATALOG_LIMIT`.
 *
 * NÃO existe controle de `limit` na interface — verificado em
 * `components/buy/`. Ou seja, ele nunca é "uma escolha explícita do usuário":
 * quando aparece na URL, ou é o default ecoado pela própria navegação, ou é
 * URL montada à mão. Por isso `limit` não entra em canonical nem em link
 * gerado, e o valor default é normalizado por redirect.
 *
 * Se um dia houver seletor de tamanho de página na UI, é AQUI que a política
 * precisa ser revisitada — não em cada rota.
 */
export const DEFAULT_CATALOG_LIMIT = 50;

export type SeoQueryCategory = "sorting" | "pagination" | "filter" | "tracking" | "territory";

export const SEO_QUERY_POLICY: Readonly<Record<string, SeoQueryCategory>> = Object.freeze({
  // ── ordenação ──────────────────────────────────────────────────────────────
  sort: "sorting",

  // ── paginação ──────────────────────────────────────────────────────────────
  page: "pagination",
  limit: "pagination",

  // ── filtros de produto ─────────────────────────────────────────────────────
  q: "filter",
  brand: "filter",
  model: "filter",
  min_price: "filter",
  max_price: "filter",
  // Aliases aceitos por `parseAdsSearchFiltersFromSearchParams`. Um alias fora
  // desta tabela é um filtro invisível para a política.
  price_min: "filter",
  price_max: "filter",
  year_min: "filter",
  year_max: "filter",
  mileage_max: "filter",
  fuel_type: "filter",
  fuel: "filter",
  transmission: "filter",
  body_type: "filter",
  below_fipe: "filter",
  highlight_only: "filter",
  highlight: "filter",
  // Filtros da Fase 3 — ausentes de `hasRestrictiveFilters` até esta correção.
  seller_kind: "filter",
  opportunity: "filter",
  priority_tier: "filter",
  // Raio do bloco "Próximos". Ortogonal a AdsSearchFilters, e por isso mesmo
  // era o mais fácil de esquecer: muda o conteúdo visível da página.
  raio: "filter",
  radius: "filter",

  // ── tracking ───────────────────────────────────────────────────────────────
  utm_source: "tracking",
  utm_medium: "tracking",
  utm_campaign: "tracking",
  utm_content: "tracking",
  utm_term: "tracking",
  utm_id: "tracking",
  gclid: "tracking",
  gbraid: "tracking",
  wbraid: "tracking",
  fbclid: "tracking",
  msclkid: "tracking",
  ttclid: "tracking",
  igshid: "tracking",
  ref: "tracking",

  // ── território (pertence ao path) ──────────────────────────────────────────
  city_slug: "territory",
  city_slugs: "territory",
  city_id: "territory",
  city: "territory",
  state: "territory",
});

/**
 * Parâmetro desconhecido conta como `filter`, não como `tracking`.
 *
 * É a escolha conservadora e a única defensável: um `?foo=bar` inventado por
 * crawler não pode gerar uma página indexável nova. Classificar como tracking
 * manteria `index` e abriria superfície ilimitada — o mesmo mecanismo que
 * produziu as 5.658 "canônica diferente".
 */
export function classifySeoQueryParam(name: string): SeoQueryCategory {
  const key = String(name || "")
    .trim()
    .toLowerCase();
  return SEO_QUERY_POLICY[key] ?? "filter";
}

export interface SeoQueryDecision {
  /** Página normalizada: inteiro >= 1. Valor inválido, 0 ou negativo vira 1. */
  page: number;
  hasSorting: boolean;
  hasFilter: boolean;
  hasTracking: boolean;
  hasTerritory: boolean;
  /** `robots: index` da URL. `follow` é sempre true — o crawl precisa seguir. */
  index: boolean;
  /** Query da canonical: `""` (URL limpa) ou `"page=N"`. */
  canonicalQuery: string;
  /** Query já normalizada (sem sort default, sem page<=1, sem valor vazio). */
  normalizedQuery: string;
  /** A URL pedida difere da normalizada ⇒ vale um redirect de normalização. */
  shouldNormalize: boolean;
}

export type SeoQueryInput =
  | URLSearchParams
  | string
  | Record<string, string | string[] | undefined>;

function toSearchParams(input: SeoQueryInput): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input.toString());
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") params.append(key, String(item));
      }
      continue;
    }
    if (value !== "") params.set(key, String(value));
  }
  return params;
}

/** `"2"` → 2; `"0"`, `"-3"`, `"abc"`, `"1.5"`, `""` → 1. */
export function normalizePageParam(raw: string | null | undefined): number {
  const value = String(raw ?? "").trim();
  if (!/^\d+$/.test(value)) return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

/**
 * Aplica a política a uma query string.
 *
 * Puro: nem toca em `window`, nem em rota. Quem chama (generateMetadata,
 * middleware, paginação) decide o que fazer com a decisão.
 */
export function decideSeoQueryPolicy(input: SeoQueryInput): SeoQueryDecision {
  const params = toSearchParams(input);

  const page = normalizePageParam(params.get("page"));

  let hasSorting = false;
  let hasFilter = false;
  let hasTracking = false;
  let hasTerritory = false;

  const normalized = new URLSearchParams();

  for (const [rawKey, rawValue] of params.entries()) {
    const key = rawKey.trim().toLowerCase();
    const value = String(rawValue ?? "").trim();

    // Parâmetro sem valor não recorta nada e só suja a URL.
    if (!value) continue;

    const category = classifySeoQueryParam(key);

    if (key === "page") {
      // `page=1` é a URL limpa escrita de outro jeito. Emitir as duas seria
      // criar duplicata do recurso mais visitado de cada cidade.
      if (page >= 2) normalized.set("page", String(page));
      continue;
    }

    if (key === "sort") {
      // Pedir a ordenação padrão é o mesmo que não pedir ordenação.
      if (value.toLowerCase() === DEFAULT_CATALOG_SORT) continue;
      hasSorting = true;
      normalized.append(key, value);
      continue;
    }

    if (category === "tracking") {
      hasTracking = true;
      normalized.append(key, value);
      continue;
    }

    if (category === "territory") {
      hasTerritory = true;
      normalized.append(key, value);
      continue;
    }

    if (category === "pagination") {
      // `limit`. Nunca é canônico e não desindexa — mas o valor DEFAULT é
      // ruído puro: `?limit=50` e a URL limpa são a mesma página. A navegação
      // interna vinha emitindo esse eco em todo link de paginação, criando uma
      // segunda grafia de cada página do catálogo.
      if (key === "limit" && Number.parseInt(value, 10) === DEFAULT_CATALOG_LIMIT) continue;
      normalized.append(key, value);
      continue;
    }

    hasFilter = true;
    normalized.append(key, value);
  }

  // Território na query de uma rota de catálogo é sempre resquício de URL
  // legada: o mesmo recurso já tem o território no path. Não pode ficar
  // indexável concorrendo com a canônica.
  const index = !hasSorting && !hasFilter && !hasTerritory;

  const canonicalQuery = index && page >= 2 ? `page=${page}` : "";

  const normalizedQuery = normalized.toString();

  return {
    page,
    hasSorting,
    hasFilter,
    hasTracking,
    hasTerritory,
    index,
    canonicalQuery,
    normalizedQuery,
    // Comparação entre duas serializações de URLSearchParams — nunca contra a
    // string crua. Sem isso, `?q=fiat%20uno` e `q=fiat+uno` pareceriam
    // diferentes para sempre e o redirect entraria em loop.
    shouldNormalize: normalizedQuery !== params.toString(),
  };
}

/**
 * Monta a canonical de uma vitrine a partir do path limpo + decisão.
 * Sempre path relativo — quem precisa de absoluta usa `toAbsoluteUrl`.
 */
export function buildCanonicalUrlWithPolicy(
  cleanPath: string,
  decision: Pick<SeoQueryDecision, "canonicalQuery">
): string {
  const path = cleanPath.replace(/\?.*$/, "");
  return decision.canonicalQuery ? `${path}?${decision.canonicalQuery}` : path;
}

/**
 * `robots` no formato que o Next espera. `follow` é SEMPRE true: mesmo numa
 * página de filtro que não queremos no índice, os links para os anúncios
 * precisam ser rastreados — é por eles que o acervo é descoberto.
 */
export function buildRobotsWithPolicy(decision: Pick<SeoQueryDecision, "index">): {
  index: boolean;
  follow: true;
} {
  return { index: decision.index, follow: true };
}
