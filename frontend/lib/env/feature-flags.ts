import "server-only";

/**
 * Feature flags server-only do frontend.
 *
 * Política:
 * - TODA flag aqui é server-only. NUNCA prefixar com `NEXT_PUBLIC_` —
 *   `NEXT_PUBLIC_*` vaza no bundle client e qualquer pessoa lendo o JS
 *   público vê o valor (e infere o roadmap).
 * - `import "server-only"` faz o Next abortar o build se algum client
 *   component importar este arquivo. Defesa em profundidade.
 * - Default seguro = `false`. Flags só ligam quando o env var existe E
 *   bate exatamente com o contrato — sem coerção indulgente. Em produção,
 *   "default false" significa que esquecer de configurar a env var nunca
 *   ativa um caminho não testado.
 */

/**
 * Controla se a futura Página Regional pública (rota `/regiao/[slug]`,
 * ainda não criada) está ativa.
 *
 * Contrato:
 * - retorna `true` SOMENTE quando `process.env.REGIONAL_PAGE_ENABLED === "true"`.
 * - qualquer outro valor (`"TRUE"`, `"1"`, `"yes"`, `"sim"`, `" true "`,
 *   `""`, `undefined`, `null`) retorna `false`.
 * - sem fallback de coerção. O contrato estrito evita que typos no
 *   painel do Render (ex.: `True`, `1`) liguem a página em prod por
 *   acidente — defaultar pra `false` é a falha segura.
 *
 * Quando a Página Regional for criada, ela DEVE chamar esta função
 * antes de renderizar e devolver 404 (notFound()) quando false. Assim
 * o roll-out fica controlado: ligamos a env var só no ambiente onde já
 * validamos canonical/sitemap/SEO.
 *
 * NÃO usar `NEXT_PUBLIC_REGIONAL_PAGE_ENABLED`. A flag é server-only
 * por design — clients não devem nem saber se a página existe enquanto
 * o roll-out está parcial.
 */
export function isRegionalPageEnabled(): boolean {
  return process.env.REGIONAL_PAGE_ENABLED === "true";
}

/**
 * Controla se a Página Regional pode ser indexada por crawlers.
 *
 * Quando `false` (default seguro): a regional emite `robots: noindex, follow`,
 * mantém todos os caminhos navegacionais ativos, mas não é candidata a
 * indexação SEO. Útil enquanto o canonical ainda aponta para a cidade-base
 * (Fase A→C do runbook regional) ou enquanto o time de SEO valida volume.
 *
 * Quando `true`: emite `robots: index, follow` — o Googlebot fica livre para
 * indexar. NÃO ativar em produção sem antes:
 *   1. ligar `REGIONAL_PAGE_CANONICAL_SELF=true` (canonical auto-referencial);
 *   2. validar que /carros-em/[slug] e /carros-usados/regiao/[slug] não estão
 *      em colisão SEO;
 *   3. confirmar que o sitemap regional NÃO foi ativado (segue desligado
 *      neste PR — flag SITEMAP_PUBLIC_ENABLED).
 *
 * Contrato estrito (mesmo padrão de `isRegionalPageEnabled`): só liga com
 * o literal `"true"` lowercase. Typos viram `false`.
 */
export function isRegionalPageIndexable(): boolean {
  return process.env.REGIONAL_PAGE_INDEXABLE === "true";
}

/**
 * Threshold mínimo de anúncios ATIVOS necessário para a Página Regional
 * ser indexável, MESMO QUE `REGIONAL_PAGE_INDEXABLE=true`.
 *
 * Lê de `REGIONAL_INDEX_MIN_ADS` (number). Default `0` = sem threshold
 * (depende apenas de `REGIONAL_PAGE_INDEXABLE`).
 *
 * Uso recomendado no rollout nacional: começar com 0 ou 1 enquanto a
 * base de anúncios é pequena; subir para 10 / 20 / 30 conforme o volume
 * de anúncios reais cresce. Evita indexar regional vazia, que prejudica
 * sinal SEO e pode gerar penalização por "thin content".
 *
 * Combinação completa para decidir indexabilidade:
 *   `shouldIndexRegionalPage(adsCount)` (helper abaixo) — sempre prefira
 *   esse helper sobre `isRegionalPageIndexable()` direto.
 */
export function regionalIndexMinAds(): number {
  const raw = process.env.REGIONAL_INDEX_MIN_ADS;
  if (raw == null || raw === "") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

/**
 * Decisão final de indexabilidade de uma Página Regional específica,
 * combinando:
 *   1. Flag global `REGIONAL_PAGE_INDEXABLE=true`.
 *   2. Threshold `REGIONAL_INDEX_MIN_ADS` (default 0 = sem threshold).
 *
 * Caller (page.tsx) já tem `adsCount` em mãos depois de chamar o BFF de
 * busca — basta passar adiante.
 *
 * @param adsCount número de anúncios ativos da região (não da amostra,
 *   o agregado `total` da paginação do backend).
 */
export function shouldIndexRegionalPage(adsCount: number): boolean {
  if (!isRegionalPageIndexable()) return false;
  const minAds = regionalIndexMinAds();
  if (minAds <= 0) return true; // sem threshold configurado
  return Number(adsCount || 0) >= minAds;
}

/**
 * Controla se a Página Regional emite canonical auto-referencial
 * (`/carros-usados/regiao/[slug]`) em vez de apontar para a cidade-base
 * (`/carros-em/[slug]`).
 *
 * Quando `false` (default): canonical da regional aponta para a página da
 * cidade-base — proteção temporária do runbook §5 enquanto a regional
 * está em ramp-up. Garante que sinal SEO da cidade não seja diluído por
 * URL nova.
 *
 * Quando `true`: canonical aponta para a própria regional. Combinar com
 * `REGIONAL_PAGE_INDEXABLE=true` para promover a regional como vitrine
 * SEO principal.
 *
 * Contrato estrito: só liga com `"true"` lowercase exato.
 */
export function isRegionalPageCanonicalSelf(): boolean {
  return process.env.REGIONAL_PAGE_CANONICAL_SELF === "true";
}

/**
 * Espelho server-only da flag `EVENTS_PUBLIC_ENABLED` do backend.
 * Default `false`: produto Evento permanece OCULTO no frontend mesmo
 * quando o fallback local de `plan-store.ts` é usado (cenário em que o
 * backend cai e o SSR cai no array hardcoded).
 *
 * Mesmo contrato strict do `isRegionalPageEnabled`: somente `"true"`
 * lowercase exato libera. Documentação completa do produto Evento e
 * checklist de reativação:
 * `docs/runbooks/events-feature-shutdown.md`.
 */
export function isEventsPublicEnabled(): boolean {
  return process.env.EVENTS_ENABLED === "true" && process.env.EVENTS_PUBLIC_ENABLED === "true";
}
