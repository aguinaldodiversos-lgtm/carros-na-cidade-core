/**
 * Redirects de canonicalização — decisões PURAS, montadas pelo `middleware.ts`.
 *
 * ── Por que no middleware, e não em `page.tsx` ───────────────────────────────
 * `redirect()`/`permanentRedirect()` num Server Component do Next 14.2 pode
 * comitar HTTP 200 com `<meta http-equiv="refresh">` quando o `<head>` já foi
 * enviado. Um meta refresh não é um redirect para o Googlebot: ele vê 200,
 * indexa a URL intermediária, e o sinal continua dividido — que é exatamente o
 * sintoma que a auditoria descreveu para `/comprar`. No middleware o status sai
 * ANTES de qualquer HTML, sempre.
 *
 * Mesma razão pela qual os 404 territoriais já moram aqui.
 *
 * ── Invariante: nenhum destino territorial fixo ──────────────────────────────
 * Todo redirect abaixo PRESERVA o slug recebido. Nenhuma função tem cidade
 * embutida, nenhuma tem fallback para "a cidade padrão". Cidade que não existe
 * já foi barrada com 404 pelos gates que rodam antes — nunca é reescrita para
 * outra cidade, porque servir o estoque de A sob a URL de B é a definição de
 * doorway page.
 */

import { getCanonicalCityPath } from "@/lib/seo/canonical-city-path";
import { decideSeoQueryPolicy } from "@/lib/seo/query-policy";

export type RedirectDecision =
  | { kind: "redirect-permanent"; pathname: string; search: string }
  | { kind: "pass" };

const PASS: RedirectDecision = { kind: "pass" };

/** `/comprar/cidade/[slug]` — com ou sem barra final, sem sub-rotas. */
const LEGACY_CITY_ROUTE = /^\/comprar\/cidade\/([^/]+)\/?$/;

/**
 * `/comprar/cidade/[slug]` → 308 `/carros-em/[slug]`.
 *
 * A rota respondia 200 com o catálogo inteiro renderizado e canonical apontando
 * para `/carros-em/[slug]`. Uma página indexável concorrendo com a canônica é
 * pior que um redirect: consome crawl budget, divide o sinal e, com o fallback
 * territorial ligado, chegava a servir o estoque de uma cidade vizinha sob a
 * URL da cidade pedida.
 *
 * A query vem NORMALIZADA pela política central — `?sort=relevance` some
 * (pedir a ordenação padrão é o mesmo que não pedir nada), `?page=1` some, e
 * qualquer filtro real do usuário é preservado. Um só salto: nunca
 * `/comprar/cidade/X → /comprar → /carros-em/X`.
 *
 * Slug inválido devolve `pass` — quem responde por ele é o `territory-gate`,
 * com 404 real. Redirecionar cidade inexistente para qualquer lugar
 * transformaria um 404 legítimo num 200 emprestado.
 */
export function decideLegacyCityRedirect(pathname: string, search: string): RedirectDecision {
  const match = LEGACY_CITY_ROUTE.exec(pathname);
  if (!match) return PASS;

  const canonicalPath = getCanonicalCityPath(decodeURIComponent(match[1] || ""));
  if (!canonicalPath) return PASS;

  const { normalizedQuery } = decideSeoQueryPolicy(search);

  return {
    kind: "redirect-permanent",
    pathname: canonicalPath,
    search: normalizedQuery ? `?${normalizedQuery}` : "",
  };
}

/**
 * Famílias de catálogo em que a normalização de query se aplica.
 *
 * Restrita de propósito. Fora do catálogo há rotas cujo `?page=`/`?sort=` tem
 * outro significado (painel, admin, APIs) e um redirect global mexeria nelas
 * sem necessidade. Rota de catálogo nova entra aqui no mesmo PR.
 */
const CATALOG_PATHS: ReadonlyArray<RegExp> = [
  /^\/carros-em\/[^/]+\/?$/,
  /^\/carros-baratos-em\/[^/]+\/?$/,
  /^\/carros-automaticos-em\/[^/]+\/?$/,
  /^\/carros-usados\/[a-z]{2}\/?$/i,
  /^\/carros-usados\/regiao\/[^/]+\/?$/,
  /^\/comprar\/estado\/[^/]+\/?$/,
  /^\/cidade\/[^/]+(?:\/.*)?$/,
];

export function isCatalogPathname(pathname: string): boolean {
  return CATALOG_PATHS.some((re) => re.test(pathname));
}

/**
 * Normaliza a query das vitrines: 308 para a mesma página sem os parâmetros
 * que não mudam o conteúdo (`sort=relevance`, `page=1`, valores vazios).
 *
 * Não é cosmético. Enquanto `?sort=relevance&page=1&limit=50` era emitido pela
 * própria navegação interna, cada clique de filtro publicava uma URL nova para
 * o mesmo recurso — e o Google as trata como candidatas a indexação.
 *
 * A idempotência vem de `decideSeoQueryPolicy`, que compara duas serializações
 * de `URLSearchParams` (nunca contra a string crua): aplicar a normalização ao
 * resultado dela devolve o próprio resultado, então não há loop.
 */
export function decideQueryNormalizationRedirect(
  pathname: string,
  search: string
): RedirectDecision {
  if (!search || search === "?") return PASS;
  if (!isCatalogPathname(pathname)) return PASS;

  const { normalizedQuery, shouldNormalize } = decideSeoQueryPolicy(search);
  if (!shouldNormalize) return PASS;

  return {
    kind: "redirect-permanent",
    pathname,
    search: normalizedQuery ? `?${normalizedQuery}` : "",
  };
}

/** UFs brasileiras — mesma lista de `normalizeUf`, sem arrastar o módulo de filtros. */
const UF_RE = /^[a-z]{2}$/;

/**
 * `/comprar?city_slug=X` e `/comprar?state=UF` → 308 para o destino FINAL.
 *
 * `/comprar` era um redirector puro: respondia via `redirect()` de Server
 * Component (307, e sujeito ao meta-refresh do Next 14.2) e, sem território na
 * URL, resolvia um estado por cookie — ou seja, a MESMA URL devolvia destinos
 * diferentes para visitantes diferentes. Um redirect não-determinístico não é
 * canonicalizável: o Google vê uma coisa, o usuário outra.
 *
 * Agora as versões parametrizadas legadas saem daqui com 308 real e destino
 * direto, e `/comprar` sem parâmetro renderiza a vitrine nacional (200,
 * autocanônica) em vez de adivinhar um território.
 *
 * `city_slug` inválido NÃO vira redirect: cai na vitrine nacional, que é a
 * resposta honesta para "pediu uma cidade que não existe". Antes caía no
 * estado default, o que servia SP para quem pediu outra coisa.
 */
export function decideComprarLegacyQueryRedirect(
  pathname: string,
  search: string
): RedirectDecision {
  if (pathname !== "/comprar" && pathname !== "/comprar/") return PASS;

  const params = new URLSearchParams((search || "").replace(/^\?/, ""));

  const citySlug = (params.get("city_slug") || "").trim();
  const stateUf = (params.get("state") || "").trim().toLowerCase();

  const cityTarget = citySlug ? getCanonicalCityPath(citySlug) : null;
  const stateTarget = !cityTarget && UF_RE.test(stateUf) ? `/comprar/estado/${stateUf}` : null;

  const target = cityTarget ?? stateTarget;
  if (!target) return PASS;

  // O território passa a viver no PATH; carregá-lo também na query criaria de
  // novo duas grafias do mesmo recurso. Os demais filtros seguem com o usuário.
  for (const key of ["city_slug", "city_id", "city", "state", "city_slugs"]) {
    params.delete(key);
  }

  const { normalizedQuery } = decideSeoQueryPolicy(params);

  return {
    kind: "redirect-permanent",
    pathname: target,
    search: normalizedQuery ? `?${normalizedQuery}` : "",
  };
}

/**
 * `/anuncios` (listagem) → 308 `/comprar`.
 *
 * A cadeia medida na auditoria era: `/anuncios` responde 200 e canonicaliza
 * para `/comprar`; `/comprar` não era destino final e herdava canonical da
 * home. Ou seja, `/anuncios` gastava crawl budget para apontar para uma URL que
 * apontava para outra. Com `/comprar` virando vitrine nacional real (200,
 * autocanônica), o alias vira um 308 direto para ela — um salto, destino final.
 *
 * A query é descartada: a listagem antiga tinha filtros próprios que a vitrine
 * nacional não replica, e levar filtros que o destino ignora produz URL suja
 * sem efeito.
 */
export function decideAnunciosListRedirect(pathname: string): RedirectDecision {
  if (pathname !== "/anuncios" && pathname !== "/anuncios/") return PASS;
  return { kind: "redirect-permanent", pathname: "/comprar", search: "" };
}
