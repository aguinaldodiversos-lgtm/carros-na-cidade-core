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
 */

const KNOWN_CLUSTER_TYPES = Object.freeze([
  "city_home",
  "city_below_fipe",
  "city_opportunities",
  "city_brand",
  "city_brand_model",
]);

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

    case "city_brand": {
      // Fase 1 NÃO tocou /cidade/[slug]/marca/[brand] — auditoria territorial
      // (docs/runbooks/territorial-canonical-audit.md) só cobriu city_home,
      // below_fipe, oportunidades, /comprar/cidade, /carros-em, /carros-baratos-em
      // e /carros-automaticos-em. Preservar comportamento existente até auditoria
      // explícita ser feita.
      const brandSlug = normalizeSlugPart(cluster.brand);
      if (!brandSlug) {
        throw new Error(
          `transformClusterPlanToCanonicalPath: city_brand requer cluster.brand não vazio (city.slug=${slug}, brand=${JSON.stringify(cluster.brand)})`
        );
      }
      return `/cidade/${slug}/marca/${brandSlug}`;
    }

    case "city_brand_model": {
      // Mesma justificativa de city_brand: Fase 1 não tocou — preservar.
      const brandSlug = normalizeSlugPart(cluster.brand);
      const modelSlug = normalizeSlugPart(cluster.model);
      if (!brandSlug) {
        throw new Error(
          `transformClusterPlanToCanonicalPath: city_brand_model requer cluster.brand não vazio (city.slug=${slug})`
        );
      }
      if (!modelSlug) {
        throw new Error(
          `transformClusterPlanToCanonicalPath: city_brand_model requer cluster.model não vazio (city.slug=${slug}, brand=${cluster.brand})`
        );
      }
      return `/cidade/${slug}/marca/${brandSlug}/modelo/${modelSlug}`;
    }

    default:
      throw new Error(
        `transformClusterPlanToCanonicalPath: cluster_type desconhecido: ${JSON.stringify(clusterType)}. Esperado um de [${KNOWN_CLUSTER_TYPES.join(", ")}].`
      );
  }
}

export const __TEST_ONLY__ = Object.freeze({
  KNOWN_CLUSTER_TYPES,
  normalizeSlugPart,
});
