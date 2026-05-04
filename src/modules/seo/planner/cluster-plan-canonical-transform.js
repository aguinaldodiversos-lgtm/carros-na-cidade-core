/**
 * Helper puro: transforma um cluster plan (vindo de
 * `cluster-planner.tasks.js#buildStageClusters`) em um path alinhado às
 * canônicas intermediárias da Fase 1 dos canonicals territoriais
 * (commit `24009155`, ver docs/runbooks/territorial-canonical-audit.md §6).
 *
 * Por que existe?
 * O builder atual gera paths como `/cidade/[slug]` e
 * `/cidade/[slug]/abaixo-da-fipe`, mas a Fase 1 fez essas URLs
 * canonicalizarem para `/carros-em/[slug]` e `/carros-baratos-em/[slug]`,
 * respectivamente. Persistir os paths originais no sitemap publicaria URLs
 * que apontam pra outras via canonical — desperdício de crawl budget e
 * sinal contraditório pra Googlebot. Este transformer reescreve o path
 * ANTES de qualquer INSERT em `seo_cluster_plans`.
 *
 * IMPORTANTE: `/carros-em/[slug]` e `/carros-baratos-em/[slug]` são
 * canônicas INTERMEDIÁRIAS, não definitivas. A arquitetura final pode
 * migrar para `/carros-usados/cidade/[slug]` num runbook futuro.
 *
 * Contrato:
 *   transformClusterPlanToCanonicalPath(cluster, city)
 *     → string  (path transformado, pronto pra INSERT)
 *     → null    (cluster_type deliberadamente skipped — caller deve pular)
 *     → throw   (cluster_type desconhecido OU dados obrigatórios faltando)
 *
 * `null` é distinto de "throw" por design: caller usa `null` como sinal
 * de "skip silencioso, esperado", e `throw` como "fail-fast, dado inválido".
 *
 * Bootstrap inicial — Opção A
 * (docs/runbooks/cluster-plan-brand-model-policy.md):
 *   - city_home          → /carros-em/[slug]            (persistível)
 *   - city_below_fipe    → /carros-baratos-em/[slug]    (persistível)
 *   - city_opportunities → null                          (skip)
 *   - city_brand         → null                          (skip — noindex em prod)
 *   - city_brand_model   → null                          (skip — noindex em prod)
 *
 * city_brand e city_brand_model estão noindex,follow em produção; persistir
 * esses paths no sitemap agora seria sinal contraditório para SEO. Quando a
 * auditoria territorial decidir canonical próprio + index,follow para essas
 * páginas, este transformer volta a emitir paths para elas.
 */

const KNOWN_CLUSTER_TYPES = Object.freeze([
  "city_home",
  "city_below_fipe",
  "city_opportunities",
  "city_brand",
  "city_brand_model",
]);

/**
 * Padrão canônico de slug de cidade: ASCII lowercase + dígitos + hífens,
 * com sufixo de UF de duas letras. Exemplos válidos: `atibaia-sp`,
 * `braganca-paulista-sp`, `s-jose-dos-campos-sp`. Inválidos: `sæo-paulo`
 * (não-ASCII), `sao-paulo` (sem UF), `SP-Atibaia` (uppercase, prefixo UF),
 * `atibaia` (sem UF).
 *
 * Bootstrap inicial só persiste cidades que casam este padrão. Slugs
 * malformados ficam fora do sitemap até o cleanup de dados ser feito em
 * runbook próprio (`cities-slug-cleanup.md`, fora do escopo do bootstrap).
 *
 * Compartilhada com `cluster-planner.repository.js` via `.source` para
 * embutir no SQL do fallback (`c.slug ~ '<source>'`). Mudou aqui? Mudou lá.
 */
export const VALID_SLUG_REGEX = /^[a-z0-9-]+-[a-z]{2}$/;

function isValidCanonicalSlug(slug) {
  return typeof slug === "string" && VALID_SLUG_REGEX.test(slug);
}

function normalizeSlugPart(value) {
  // Mantém comportamento de cluster-planner.tasks.js (trim + lowercase, sem encode).
  return String(value || "")
    .trim()
    .toLowerCase();
}

function requireNonEmpty(value, label, context) {
  const v = String(value || "").trim();
  if (!v) {
    throw new Error(
      `transformClusterPlanToCanonicalPath: ${label} é obrigatório (contexto: ${context})`
    );
  }
  return v;
}

export function transformClusterPlanToCanonicalPath(cluster, city) {
  if (!cluster || typeof cluster !== "object") {
    throw new Error("transformClusterPlanToCanonicalPath: cluster é obrigatório");
  }
  if (!city || typeof city !== "object") {
    throw new Error("transformClusterPlanToCanonicalPath: city é obrigatório");
  }

  const slug = requireNonEmpty(city.slug, "city.slug", `cluster_type=${cluster.cluster_type}`);

  // Validação de formato — fail-fast. Aplica a TODOS os tipos (mesmo
  // os skipados): slug malformado é sempre sinal de dado upstream
  // defeituoso, e o script (runBootstrap) tem fail-fast pré-persist
  // para abortar o batch inteiro quando um cluster falha transformação.
  // O fallback do repository já filtra antes via SQL; esta validação é
  // rede de segurança caso `city_scores` (fonte primária) traga lixo.
  if (!isValidCanonicalSlug(slug)) {
    throw new Error(
      `transformClusterPlanToCanonicalPath: city.slug fora do padrão canônico ${VALID_SLUG_REGEX.source} (cluster_type=${cluster.cluster_type}, slug=${JSON.stringify(slug)})`
    );
  }

  const clusterType = cluster.cluster_type;

  switch (clusterType) {
    case "city_home":
      // Fase 1: /cidade/[slug] (noindex,follow) canonicaliza para /carros-em/[slug].
      // Sitemap deve listar a indexável (canônica intermediária), não a antiga.
      return `/carros-em/${slug}`;

    case "city_below_fipe":
      // Fase 1: /cidade/[slug]/abaixo-da-fipe (noindex,follow) canonicaliza para
      // /carros-baratos-em/[slug] (canônica intermediária da intenção
      // "barato/abaixo-da-fipe"). Sitemap deve listar a indexável.
      return `/carros-baratos-em/${slug}`;

    case "city_opportunities":
      // Fase 1: /cidade/[slug]/oportunidades (noindex,follow) canonicaliza para
      // /carros-baratos-em/[slug] — MESMA URL que city_below_fipe transforma para.
      // Persistir city_opportunities geraria duplicidade no sitemap (duas linhas em
      // seo_cluster_plans com paths que serializam para o mesmo /carros-baratos-em/X).
      // Skip aqui é a escolha correta — caller pula esta entrada.
      return null;

    case "city_brand":
      // Bootstrap inicial — Opção A
      // (docs/runbooks/cluster-plan-brand-model-policy.md):
      // /cidade/[slug]/marca/[brand] está noindex,follow em produção.
      // Persistir esse path no sitemap agora cria sinal contraditório
      // (sitemap diz "indexe" enquanto a página diz "não indexe"). Skip
      // explícito até a página ganhar canonical próprio + index,follow.
      return null;

    case "city_brand_model":
      // Mesma justificativa de city_brand: a página
      // /cidade/[slug]/marca/[brand]/modelo/[model] também está
      // noindex,follow em produção. Skip no bootstrap inicial até auditoria
      // territorial explícita decidir o canonical desta intenção.
      return null;

    default:
      throw new Error(
        `transformClusterPlanToCanonicalPath: cluster_type desconhecido: ${JSON.stringify(clusterType)}. Esperado um de [${KNOWN_CLUSTER_TYPES.join(", ")}].`
      );
  }
}

export const __TEST_ONLY__ = Object.freeze({
  KNOWN_CLUSTER_TYPES,
  normalizeSlugPart,
  isValidCanonicalSlug,
});
