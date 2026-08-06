/**
 * Hard gate de EXISTÊNCIA de cidade, executado no `middleware.ts` (Edge),
 * antes do App Router pegar a rota.
 *
 *   "Uma cidade só existe a partir do momento em que um anunciante publica um
 *    anúncio nela. O conjunto de cidades públicas NÃO é uma lista. É o
 *    resultado de SELECT DISTINCT cidade FROM ads WHERE ativo."
 *
 * Ver `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`.
 *
 * ── Por que no middleware ────────────────────────────────────────────────
 * Mesmo motivo do `ad-detail-gate` e do `territory-gate`: no Next 14.2.35,
 * `notFound()` em server component — mesmo com `force-dynamic` — renderiza o
 * body do not-found mas comita HTTP 200 (soft-404), que o Google indexa.
 *
 * ── Por que o CONJUNTO INTEIRO e não um endpoint por slug ────────────────
 * O tráfego que precisamos barrar é crawler varrendo milhares de slugs
 * distintos. Um endpoint por slug viraria milhares de chamadas ao backend —
 * o gate financiaria o próprio ataque. O conjunto é pequeno por natureza (só
 * cidades COM estoque), cabe numa resposta e dá lookup O(1) para qualquer
 * slug, inclusive os inventados.
 *
 * ── Fail-open, deliberado ─────────────────────────────────────────────────
 * Backend fora do ar → `unavailable` → PASSA. Igual ao `ad-detail-gate` e
 * pelo mesmo motivo, aqui ainda mais grave: este gate roda em toda rota
 * territorial. Falhar fechado num cold-start transformaria uma indisponibilidade
 * de backend em 404 no site inteiro — trocaria um problema de SEO por uma
 * queda. O pior caso do fail-open é voltar ao comportamento de hoje durante a
 * janela.
 */

/**
 * Famílias de rota com escopo de CIDADE. O slug da cidade é sempre o primeiro
 * segmento após o prefixo.
 *
 * Esta lista precisa ser EXAUSTIVA — o bug original é exatamente que
 * `tabela-fipe` e `blog` ficaram de fora da regra. Ao criar rota territorial
 * nova, entra aqui no mesmo PR.
 */
const CITY_PREFIX_PATTERNS: ReadonlyArray<{ family: string; re: RegExp }> = [
  { family: "comprar-cidade", re: /^\/comprar\/cidade\/([^/]+)(?:\/|$)/ },
  { family: "carros-em", re: /^\/carros-em\/([^/]+)(?:\/|$)/ },
  { family: "carros-baratos-em", re: /^\/carros-baratos-em\/([^/]+)(?:\/|$)/ },
  { family: "carros-automaticos-em", re: /^\/carros-automaticos-em\/([^/]+)(?:\/|$)/ },
  { family: "tabela-fipe", re: /^\/tabela-fipe\/([^/]+)(?:\/|$)/ },
  { family: "simulador-financiamento", re: /^\/simulador-financiamento\/([^/]+)(?:\/|$)/ },
  // Cobre /cidade/[slug], /cidade/[slug]/marca/..., /modelo/..., /abaixo-da-fipe
  // e /oportunidades de uma vez — o slug é sempre o 1º segmento.
  { family: "cidade", re: /^\/cidade\/([^/]+)(?:\/|$)/ },
  // Dual: pode ser POST do CMS ou hub de cidade. Ver `isCityLikeSlug`.
  { family: "blog", re: /^\/blog\/([^/]+)(?:\/|$)/ },
  // `/carros-usados/regiao/[slug]` recebe slug de CIDADE, não de UF: é a região
  // ANCORADA naquela cidade (`resolveTerritory({ level: "region", regionSlug })`,
  // H1 "Carros usados em {cidade} e região"). Chegou a ficar no gate de UF, sob
  // o argumento de que a região pode ter vizinhas com estoque mesmo com a âncora
  // vazia — mas isso produzia a contradição de uma página cujo H1 nomeia uma
  // cidade que dá 404 em todas as outras 7 rotas. A rota aceita cidade, logo é
  // do gate de cidade. Ver a ressalva sobre vizinhança no ADR.
  { family: "carros-usados-regiao", re: /^\/carros-usados\/regiao\/([^/]+)(?:\/|$)/ },
];

/**
 * Slug "com cara de cidade": termina em `-<uf>` (2 letras). A validação de UF
 * REAL continua sendo do `territory-gate`, que roda antes; aqui só precisamos
 * distinguir cidade de outra coisa.
 *
 * Existe por causa de `/blog/[cidade]`, que é DUAL: `/blog/<slug>` resolve
 * primeiro um post publicado do CMS e só depois o hub de cidade. Um post
 * chamado "melhores-suvs-2026" NÃO pode levar 404 por não ser cidade. Slug de
 * post terminando em `-<uf>` seria colisão com cidade — caso que o admin do
 * blog já trata como conflito a evitar.
 */
/**
 * Famílias de rota com escopo de UF (estado inteiro).
 *
 *   "UF sem nenhum anúncio no estado inteiro também não existe."
 *
 * Hoje `/carros-usados/ce` e `/comprar/estado/ce` respondem 200 `index,follow`
 * com o Ceará vazio — 27 estados de conteúdo vazio indexável. Pior: essas
 * páginas linkam de volta para cidades, reabrindo o ciclo de descoberta que o
 * gate de cidade fecha.
 *
 * `/carros-usados/regiao/[slug]` entra aqui, e não no gate de cidade, de
 * propósito: o slug é a ÂNCORA de uma região que pode incluir vizinhas com
 * estoque mesmo quando a âncora não tem. Gatear pela cidade âncora mataria
 * região legítima. Pela UF é seguro: estado sem nenhum anúncio não pode ter
 * região com estoque.
 */
const UF_PREFIX_PATTERNS: ReadonlyArray<{ family: string; re: RegExp }> = [
  // `/carros-usados/[uf]` — 2 segmentos. NÃO casa `/carros-usados/regiao/[slug]`
  // (3 segmentos), que é rota de CIDADE e vive em CITY_PREFIX_PATTERNS.
  { family: "carros-usados-uf", re: /^\/carros-usados\/([^/]+)\/?$/ },
  { family: "comprar-estado", re: /^\/comprar\/estado\/([^/]+)(?:\/|$)/ },
];

/**
 * `/[uf]/regiao/[ancora]` NÃO está aqui de propósito.
 *
 * Medido em produção: é alias 301 para a canônica.
 *   /ce/regiao/alguma-ancora → 301 → /carros-usados/regiao/alguma-ancora-ce → 404
 *
 * O destino é rota de cidade e já passa pelo gate de cidade, então gatear o
 * alias seria uma segunda decisão sobre o mesmo recurso — e um fetch a mais
 * por request. Um 301 que aterrissa em 404 é perfeitamente legível para
 * crawler. O smoke SEGUE o redirect e afere o status final.
 */

/** `"sao-jose-dos-campos-sp"` → `"sp"`. Vazio quando não há sufixo de UF. */
export function ufFromCitySlug(slug: string): string {
  const parts = String(slug || "")
    .trim()
    .toLowerCase()
    .split("-")
    .filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1];
  return /^[a-z]{2}$/.test(last) ? last : "";
}

export function isCityLikeSlug(slug: string): boolean {
  const parts = String(slug || "")
    .trim()
    .toLowerCase()
    .split("-")
    .filter(Boolean);
  if (parts.length < 2) return false;
  return /^[a-z]{2}$/.test(parts[parts.length - 1]);
}

export interface CityScopedMatch {
  family: string;
  citySlug: string;
}

export interface UfScopedMatch {
  family: string;
  uf: string;
}

/**
 * Extrai a UF do pathname quando for rota com escopo de estado.
 * `null` → o caller sai cedo, sem custar fetch.
 *
 * Só devolve match quando a UF tem forma de UF (2 letras). A validação de UF
 * REAL fica com o `territory-gate`, que roda antes — aqui basta não confundir
 * `/lojas/regiao/x` com `/[uf]/regiao/x`.
 */
export function extractUfScopedMatch(pathname: string): UfScopedMatch | null {
  for (const { family, re } of UF_PREFIX_PATTERNS) {
    const match = re.exec(pathname);
    if (!match) continue;

    const uf = decodeURIComponent(match[1] || "")
      .trim()
      .toLowerCase();
    if (!/^[a-z]{2}$/.test(uf)) return null;

    return { family, uf };
  }
  return null;
}

/**
 * Extrai a cidade do pathname quando for rota com escopo de cidade.
 * `null` → o caller sai cedo, sem custar fetch.
 */
export function extractCityScopedMatch(pathname: string): CityScopedMatch | null {
  for (const { family, re } of CITY_PREFIX_PATTERNS) {
    const match = re.exec(pathname);
    if (!match) continue;

    const citySlug = decodeURIComponent(match[1] || "")
      .trim()
      .toLowerCase();
    if (!citySlug) return null;

    // Blog: só tratamos como cidade o que tem forma de cidade; o resto é post.
    if (family === "blog" && !isCityLikeSlug(citySlug)) return null;

    return { family, citySlug };
  }
  return null;
}

export type CitySetUnavailableReason =
  | "missing-backend-api-url"
  | "missing-internal-api-token"
  | "backend-401"
  | "backend-403"
  | "backend-5xx"
  | "backend-timeout"
  | "bad-payload"
  | "fetch-error";

export type PublicCitySet = {
  cities: Record<string, number>;
  /** Agregado por estado, derivado das MESMAS cidades — não é segunda fonte. */
  ufs: Record<string, number>;
  total: number;
  existsMinAds: number;
  indexMinAds: number;
};

export type CitySetResult =
  | { kind: "ok"; set: PublicCitySet }
  | { kind: "unavailable"; reason: CitySetUnavailableReason; detail?: string };

export interface CitySetFetchConfig {
  apiBase?: string;
  token?: string;
  /** TTL do data cache do Next. Default 60s — a janela do estado derivado. */
  revalidateSeconds?: number;
  /** Default 6s, mesmo orçamento do ad-detail-gate. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Busca o conjunto de cidades públicas no backend, cacheado no data cache do
 * Edge por `revalidateSeconds`. Uma entrada de cache para o site todo.
 */
export async function fetchPublicCitySet(config: CitySetFetchConfig = {}): Promise<CitySetResult> {
  const apiBase = (config.apiBase ?? process.env.BACKEND_API_URL ?? "").replace(/\/+$/, "");
  const token = (config.token ?? process.env.INTERNAL_API_TOKEN ?? "").trim();
  const revalidate = config.revalidateSeconds ?? 60;
  const timeoutMs = config.timeoutMs ?? 6000;
  const fetchImpl = config.fetchImpl ?? fetch;

  if (!apiBase) return { kind: "unavailable", reason: "missing-backend-api-url" };
  if (!token) return { kind: "unavailable", reason: "missing-internal-api-token" };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(`${apiBase}/api/public/cities/public-set`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "cnc-internal/1.0",
        "X-Internal-Token": token,
      },
      signal: controller.signal,
      next: { revalidate, tags: ["public-city-set"] },
    });

    if (response.status === 401) return { kind: "unavailable", reason: "backend-401" };
    if (response.status === 403) return { kind: "unavailable", reason: "backend-403" };
    if (response.status !== 200) {
      return { kind: "unavailable", reason: "backend-5xx", detail: `status ${response.status}` };
    }

    const json = (await response.json()) as { data?: Partial<PublicCitySet> } | null;
    const cities = json?.data?.cities;

    // Payload malformado NÃO pode virar "conjunto vazio": vazio significaria
    // "nenhuma cidade existe" e o gate 404aria o site inteiro. Mesma lição do
    // sitemap que cacheou `[]` como sucesso e desindexou por semanas.
    if (!cities || typeof cities !== "object" || Array.isArray(cities)) {
      return { kind: "unavailable", reason: "bad-payload" };
    }

    const rawUfs = json?.data?.ufs;
    // `ufs` ausente NÃO invalida o payload: um backend anterior ao gate de UF
    // devolve só `cities`. Derivamos do sufixo dos slugs — assim o deploy do
    // frontend não depende da ordem em relação ao do backend. Se derivássemos
    // "vazio", toda UF 404aria durante a janela entre os dois deploys.
    const ufs =
      rawUfs && typeof rawUfs === "object" && !Array.isArray(rawUfs)
        ? (rawUfs as Record<string, number>)
        : deriveUfsFromCities(cities as Record<string, number>);

    return {
      kind: "ok",
      set: {
        cities: cities as Record<string, number>,
        ufs,
        total: Number(json?.data?.total) || Object.keys(cities).length,
        existsMinAds: Number(json?.data?.existsMinAds) || 1,
        indexMinAds: Number(json?.data?.indexMinAds) || 3,
      },
    };
  } catch (err) {
    if (timedOut) return { kind: "unavailable", reason: "backend-timeout" };
    return {
      kind: "unavailable",
      reason: "fetch-error",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback quando o backend ainda não expõe `ufs` (janela entre deploys). */
export function deriveUfsFromCities(cities: Record<string, number>): Record<string, number> {
  const ufs: Record<string, number> = {};
  for (const [slug, total] of Object.entries(cities || {})) {
    const uf = ufFromCitySlug(slug);
    if (uf) ufs[uf] = (ufs[uf] || 0) + (Number(total) || 0);
  }
  return ufs;
}

export type UfExistenceAction =
  | { kind: "pass-exists"; uf: string; activeAds: number }
  | { kind: "block-not-found"; uf: string }
  | { kind: "pass-unavailable"; reason: CitySetUnavailableReason };

/**
 * Decisão PURA para escopo de UF. Mesma regra da cidade, um nível acima:
 * estado sem NENHUM anúncio não existe.
 */
export function decideUfExistenceAction(
  match: UfScopedMatch,
  result: CitySetResult
): UfExistenceAction {
  if (result.kind === "unavailable") {
    return { kind: "pass-unavailable", reason: result.reason };
  }

  const activeAds = Number(result.set.ufs?.[match.uf]) || 0;
  if (activeAds <= 0) return { kind: "block-not-found", uf: match.uf };

  return { kind: "pass-exists", uf: match.uf, activeAds };
}

export type CityExistenceAction =
  | { kind: "pass-exists"; citySlug: string; activeAds: number }
  | { kind: "block-not-found"; citySlug: string }
  | { kind: "pass-unavailable"; reason: CitySetUnavailableReason };

/**
 * Decisão PURA: a cidade está no conjunto?
 *
 * Note que não há caso "cidade existe mas está abaixo do limiar de indexação"
 * aqui — indexação é outro eixo, decidido no `generateMetadata` de cada rota
 * sobre o RECORTE dela. Este gate responde só "existe ou não".
 */
export function decideCityExistenceAction(
  match: CityScopedMatch,
  result: CitySetResult
): CityExistenceAction {
  if (result.kind === "unavailable") {
    return { kind: "pass-unavailable", reason: result.reason };
  }

  const activeAds = Number(result.set.cities[match.citySlug]) || 0;
  if (activeAds <= 0) {
    return { kind: "block-not-found", citySlug: match.citySlug };
  }

  return { kind: "pass-exists", citySlug: match.citySlug, activeAds };
}

export const __testing = { CITY_PREFIX_PATTERNS };
