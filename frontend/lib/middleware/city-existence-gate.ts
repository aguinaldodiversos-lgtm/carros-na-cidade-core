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
 * ── FAIL-SAFE (substituiu o fail-open em 2026-08-07) ──────────────────────
 * A versão anterior tratava "não consegui verificar" como "pode passar":
 * backend fora → `pass-unavailable` → 200. O raciocínio era evitar que um
 * cold-start virasse 404 no site inteiro.
 *
 * O problema é que isso torna o gate desligável por acidente. Medido em
 * produção local: dois builds do mesmo código, diferindo só na presença de
 * `INTERNAL_API_TOKEN` no ambiente de BUILD, produziam
 * `/carros-em/<cidade-sem-anúncio>` respondendo 404 ou 200. Uma variável
 * esquecida desligava o invariante inteiro — sem erro, sem log, sem sintoma
 * até o Google indexar.
 *
 * A política agora tem TRÊS respostas, não duas:
 *
 *   cidade comprovadamente sem anúncio  → 404
 *   cidade comprovadamente ativa        → segue
 *   não consegui verificar              → último snapshot válido, se houver;
 *                                         senão 503 (temporário, não indexável)
 *
 * O snapshot (`gate-snapshot.ts`) é o que torna isso viável sem fragilizar o
 * site: um blip de rede continua sendo decidido com o último estado real
 * conhecido. Só cold-start COM backend fora chega ao 503 — e 503 é recuperável,
 * enquanto uma página indevida indexada não é.
 *
 * ── O token NÃO é obrigatório ─────────────────────────────────────────────
 * `INTERNAL_API_TOKEN` nunca foi autorização para este endpoint. Verificado no
 * backend e por requisição real: `/api/public/cities/public-set` não tem
 * middleware de auth, e `cnc-internal/1.0` não está na blocklist do
 * bot-blocker. Sem token e com token inválido, o endpoint responde 200. O
 * token só faz a chamada PULAR o rate-limit (`isAuthenticatedInternalCall`).
 *
 * Ou seja: o antigo `if (!token) return unavailable` recusava-se a tentar uma
 * chamada que teria funcionado. Era o gate se auto-desligando.
 */

import { readBackendApiBaseUrl, readInternalApiToken } from "./gate-runtime-env";
import { GateSnapshotStore, getSnapshotMaxAgeMs } from "./gate-snapshot";

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
  // `missing-internal-api-token` NÃO existe mais como motivo de
  // indisponibilidade. O token é bypass de rate-limit, não autorização — ver a
  // nota no topo. Manter o motivo faria o gate se recusar a tentar uma chamada
  // que funciona.
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
  /**
   * Backend fora, mas temos o último conjunto confirmado. A decisão sai daqui
   * com o MESMO rigor de um `ok` — o dado é real, só não é desta requisição.
   */
  | { kind: "stale"; set: PublicCitySet; reason: CitySetUnavailableReason; ageMs: number }
  | { kind: "unavailable"; reason: CitySetUnavailableReason; detail?: string };

export interface CitySetFetchConfig {
  apiBase?: string;
  token?: string;
  /** TTL do data cache do Next. Default 60s — a janela do estado derivado. */
  revalidateSeconds?: number;
  /** Default 6s, mesmo orçamento do ad-detail-gate. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Relógio injetável — só teste passa. */
  now?: number;
  /** Idade máxima do snapshot. Default `getSnapshotMaxAgeMs()`. */
  snapshotMaxAgeMs?: number;
}

/**
 * Cofre do último conjunto CONFIRMADO. Uma entrada só: o conjunto inteiro é um
 * documento pequeno e cabe numa chave.
 */
const CITY_SET_SNAPSHOT = new GateSnapshotStore<PublicCitySet>(1);
const CITY_SET_SNAPSHOT_KEY = "public-city-set";

/** Uso EXCLUSIVO de teste — estado de módulo contamina caso a caso. */
export function __resetCitySetSnapshot(): void {
  CITY_SET_SNAPSHOT.clear();
}

/**
 * Falha de rede/backend: tenta o último snapshot antes de declarar
 * indisponibilidade. É aqui que "não consegui verificar" deixa de virar 200.
 */
function degradedCitySet(
  reason: CitySetUnavailableReason,
  now: number,
  detail?: string,
  maxAgeMs?: number
): CitySetResult {
  const lookup = CITY_SET_SNAPSHOT.lookup(
    CITY_SET_SNAPSHOT_KEY,
    now,
    maxAgeMs ?? getSnapshotMaxAgeMs()
  );

  if (lookup.kind === "hit") {
    logGateDegraded(
      `conjunto de cidades indisponível (${reason}) — decidindo com snapshot de ${Math.round(
        lookup.ageMs / 1000
      )}s atrás`
    );
    return { kind: "stale", set: lookup.value, reason, ageMs: lookup.ageMs };
  }

  logGateDegraded(
    `conjunto de cidades indisponível (${reason}) e sem snapshot utilizável (${lookup.kind}) — respondendo 503`
  );
  return { kind: "unavailable", reason, detail };
}

/**
 * Falha de gate SEMPRE loga.
 *
 * Um gate que se degrada em silêncio é indistinguível de um gate que funciona —
 * foi exatamente assim que a dependência de build passou despercebida. O custo
 * de uma linha de stderr é irrelevante perto de descobrir isso pelo Search
 * Console semanas depois.
 */
function logGateDegraded(message: string): void {
  if (typeof window !== "undefined") return;
  // eslint-disable-next-line no-console
  console.error(`[city-existence-gate] ${message}`);
}

/**
 * Busca o conjunto de cidades públicas no backend, cacheado no data cache do
 * Edge por `revalidateSeconds`. Uma entrada de cache para o site todo.
 */
export async function fetchPublicCitySet(config: CitySetFetchConfig = {}): Promise<CitySetResult> {
  const apiBase = (config.apiBase ?? readBackendApiBaseUrl()).replace(/\/+$/, "");
  const token = (config.token ?? readInternalApiToken()).trim();
  const revalidate = config.revalidateSeconds ?? 60;
  const timeoutMs = config.timeoutMs ?? 6000;
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now();
  const maxAgeMs = config.snapshotMaxAgeMs;

  // Sem base de API não há o que chamar — é a única condição que impede a
  // tentativa. Token ausente NÃO impede: o endpoint é público (ver nota no
  // topo) e recusar-se a tentar era o gate se desligando sozinho.
  if (!apiBase) return degradedCitySet("missing-backend-api-url", now);

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

    // 401/403 continuam sendo indisponibilidade e não "cidade não existe": um
    // erro de autenticação diz que NÃO SABEMOS, e não saber nunca pode virar
    // 200 nem 404. Cai no snapshot; sem snapshot, 503.
    if (response.status === 401) return degradedCitySet("backend-401", now, undefined, maxAgeMs);
    if (response.status === 403) return degradedCitySet("backend-403", now, undefined, maxAgeMs);
    if (response.status !== 200) {
      return degradedCitySet("backend-5xx", now, `status ${response.status}`, maxAgeMs);
    }

    const json = (await response.json()) as { data?: Partial<PublicCitySet> } | null;
    const cities = json?.data?.cities;

    // Payload malformado NÃO pode virar "conjunto vazio": vazio significaria
    // "nenhuma cidade existe" e o gate 404aria o site inteiro. Mesma lição do
    // sitemap que cacheou `[]` como sucesso e desindexou por semanas.
    if (!cities || typeof cities !== "object" || Array.isArray(cities)) {
      return degradedCitySet("bad-payload", now, undefined, maxAgeMs);
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

    const set: PublicCitySet = {
      cities: cities as Record<string, number>,
      ufs,
      total: Number(json?.data?.total) || Object.keys(cities).length,
      existsMinAds: Number(json?.data?.existsMinAds) || 1,
      indexMinAds: Number(json?.data?.indexMinAds) || 3,
    };

    // Só resposta CONFIRMADA vira snapshot. Guardar o resultado de uma falha
    // seria cachear "não sei" como estado bom — o defeito que congelou o
    // sitemap vazio por semanas em 2026-07-27.
    CITY_SET_SNAPSHOT.remember(CITY_SET_SNAPSHOT_KEY, set, now);

    return { kind: "ok", set };
  } catch (err) {
    if (timedOut) return degradedCitySet("backend-timeout", now, undefined, maxAgeMs);
    return degradedCitySet(
      "fetch-error",
      now,
      err instanceof Error ? err.message : String(err),
      maxAgeMs
    );
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
  | { kind: "pass-exists"; uf: string; activeAds: number; source: GateDecisionSource }
  | { kind: "block-not-found"; uf: string; source: GateDecisionSource }
  /** Nem confirmado nem negado: 503 temporário. NUNCA 200. */
  | { kind: "block-unavailable"; reason: CitySetUnavailableReason };

/** De onde veio o dado que sustentou a decisão. Vira header de diagnóstico. */
export type GateDecisionSource = "fresh" | "snapshot";

/**
 * Decisão PURA para escopo de UF. Mesma regra da cidade, um nível acima:
 * estado sem NENHUM anúncio não existe.
 */
export function decideUfExistenceAction(
  match: UfScopedMatch,
  result: CitySetResult
): UfExistenceAction {
  if (result.kind === "unavailable") {
    return { kind: "block-unavailable", reason: result.reason };
  }

  const source: GateDecisionSource = result.kind === "stale" ? "snapshot" : "fresh";
  const activeAds = Number(result.set.ufs?.[match.uf]) || 0;
  if (activeAds <= 0) return { kind: "block-not-found", uf: match.uf, source };

  return { kind: "pass-exists", uf: match.uf, activeAds, source };
}

export type CityExistenceAction =
  | { kind: "pass-exists"; citySlug: string; activeAds: number; source: GateDecisionSource }
  | { kind: "block-not-found"; citySlug: string; source: GateDecisionSource }
  /** Nem confirmado nem negado: 503 temporário. NUNCA 200. */
  | { kind: "block-unavailable"; reason: CitySetUnavailableReason };

/**
 * Decisão PURA: a cidade está no conjunto?
 *
 * Três saídas, não duas. A terceira — `block-unavailable` — é a correção de
 * 2026-08-07: antes, "não consegui verificar" devolvia `pass-unavailable` e a
 * rota respondia 200 como se o gate não existisse.
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
    return { kind: "block-unavailable", reason: result.reason };
  }

  // `stale` decide com o MESMO rigor de `ok`: o dado é real e confirmado, só
  // não é desta requisição. O `source` deixa isso observável no header.
  const source: GateDecisionSource = result.kind === "stale" ? "snapshot" : "fresh";
  const activeAds = Number(result.set.cities[match.citySlug]) || 0;
  if (activeAds <= 0) {
    return { kind: "block-not-found", citySlug: match.citySlug, source };
  }

  return { kind: "pass-exists", citySlug: match.citySlug, activeAds, source };
}

export const __testing = { CITY_PREFIX_PATTERNS };
