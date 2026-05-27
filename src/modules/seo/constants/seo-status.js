/**
 * Constantes compartilhadas de status SEO.
 *
 * Source-of-truth para qualquer SQL/serviço que lê ou escreve `seo_cluster_plans.status`,
 * `seo_publications.status` ou `cluster_type`. Evita o drift histórico documentado em
 * docs/runbooks/seo-cluster-plans-state-machine.md §3.1.
 *
 * Política de status aceitos pelos sitemaps (público + admin) na Fase 3.1:
 * - `planned`: cluster identificado pelo planner, publicação pendente
 * - `published`: cluster com publicação real associada
 * - `generated`: legado — aceito durante transição (ninguém escreve hoje, mas linhas
 *   antigas no banco podem ter esse valor; remover só após sweep documentado em runbook)
 *
 * NÃO elegíveis a sitemap (transientes/finais):
 * - `generating`: in-progress; sai da janela elegível enquanto o executor roda
 * - `failed`: tentou publicar, erro persistente
 * - `archived`: removido do pipeline ativo
 */

export const SCP_STATUS = Object.freeze({
  PLANNED: "planned",
  GENERATING: "generating",
  PUBLISHED: "published",
  FAILED: "failed",
  ARCHIVED: "archived",
});

export const SP_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  REVIEW_REQUIRED: "review_required",
  ARCHIVED: "archived",
});

/**
 * Status de `seo_cluster_plans` elegíveis a aparecer em qualquer sitemap.
 * Inclui `generated` apenas para compatibilidade com dados legados — não escrever
 * novos registros com este valor.
 */
export const SITEMAP_ELIGIBLE_SCP_STATUSES = Object.freeze([
  SCP_STATUS.PLANNED,
  SCP_STATUS.PUBLISHED,
  "generated",
]);

/**
 * Status de `seo_publications` elegíveis quando há JOIN com cluster (sitemap canônico).
 * `null` (publicação ausente) é tratado separadamente pelo SQL: `sp.id IS NULL OR sp.status IN (...)`.
 */
export const SITEMAP_ELIGIBLE_SP_STATUSES = Object.freeze([
  SP_STATUS.PUBLISHED,
  SP_STATUS.REVIEW_REQUIRED,
]);

/**
 * Cluster types canônicos — espelho de
 * src/modules/seo/planner/cluster-planner.tasks.js#buildStageClusters.
 */
export const CLUSTER_TYPES = Object.freeze({
  CITY_HOME: "city_home",
  CITY_BELOW_FIPE: "city_below_fipe",
  CITY_OPPORTUNITIES: "city_opportunities",
  CITY_BRAND: "city_brand",
  CITY_BRAND_MODEL: "city_brand_model",
});

/**
 * Mapeamento dos buckets (nomes amigáveis usados em /sitemaps/*.xml e no painel
 * admin) para os `cluster_type` reais persistidos em `seo_cluster_plans`.
 *
 * Antes da Fase 3.1, admin-seo.service.js usava nomes como `"city"` e
 * `"below_fipe"` que não batiam com `"city_home"`/`"city_below_fipe"` reais —
 * resultando em 6 buckets sempre "vazios" no painel mesmo com clusters
 * persistidos. Esta tabela é a tradução oficial.
 */
export const SITEMAP_BUCKET_TO_CLUSTER_TYPE = Object.freeze({
  cities: CLUSTER_TYPES.CITY_HOME,
  below_fipe: CLUSTER_TYPES.CITY_BELOW_FIPE,
  brands: CLUSTER_TYPES.CITY_BRAND,
  models: CLUSTER_TYPES.CITY_BRAND_MODEL,
  opportunities: CLUSTER_TYPES.CITY_OPPORTUNITIES,
});

/**
 * Builder de fragmento SQL `IN (...)` parametrizável.
 * Uso: const { sql, params } = sqlInClause(STATUSES, startIdx); → `IN ($3,$4,$5)`.
 *
 * @param {readonly string[]} values
 * @param {number} startIdx índice do primeiro placeholder ($N)
 * @returns {{ sql: string, params: string[] }}
 */
export function sqlInClause(values, startIdx = 1) {
  const placeholders = values.map((_, i) => `$${startIdx + i}`).join(",");
  return { sql: `IN (${placeholders})`, params: [...values] };
}

/**
 * Versão "inline literal" para casos em que parametrizar quebra a legibilidade
 * de uma query estática (status são whitelistadas neste módulo, não user input).
 * Retorna `IN ('planned','published','generated')`.
 */
export function sqlInLiteral(values) {
  const escaped = values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",");
  return `IN (${escaped})`;
}
