import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { recordAdminAction } from "../admin.audit.js";
import { CLUSTER_TYPES } from "../../seo/constants/seo-status.js";
import * as repo from "./admin-seo.repository.js";

const VALID_STATUS = Object.freeze(["draft", "planned", "published", "archived"]);
const VALID_HEALTH = Object.freeze(["healthy", "ok", "degraded", "stale", "error"]);

/**
 * Lista de sitemaps canonicos (corresponde aos arquivos em
 * frontend/app/sitemaps/). `cluster_type` é o valor real persistido em
 * `seo_cluster_plans.cluster_type` — alinhado a
 * src/modules/seo/constants/seo-status.js#CLUSTER_TYPES.
 *
 * `regiao/[state]` tem um arquivo por UF — agrupamos com `dynamic: true`.
 * `local_seo` continua sem cluster_type associado (vazio por design — ver
 * docs/runbooks/sitemap-empty-investigation.md §8).
 */
const SITEMAP_INDEX = Object.freeze([
  { name: "core", url: "/sitemaps/core.xml", cluster_type: null, fixed_paths: true },
  { name: "content", url: "/sitemaps/content.xml", cluster_type: null, fixed_paths: true },
  { name: "cities", url: "/sitemaps/cities.xml", cluster_type: CLUSTER_TYPES.CITY_HOME },
  { name: "brands", url: "/sitemaps/brands.xml", cluster_type: CLUSTER_TYPES.CITY_BRAND },
  { name: "models", url: "/sitemaps/models.xml", cluster_type: CLUSTER_TYPES.CITY_BRAND_MODEL },
  {
    name: "below_fipe",
    url: "/sitemaps/below-fipe.xml",
    cluster_type: CLUSTER_TYPES.CITY_BELOW_FIPE,
  },
  {
    name: "opportunities",
    url: "/sitemaps/opportunities.xml",
    cluster_type: CLUSTER_TYPES.CITY_OPPORTUNITIES,
  },
  { name: "local_seo", url: "/sitemaps/local-seo.xml", cluster_type: null, fixed_paths: true },
  { name: "regiao", url: "/sitemaps/regiao/[state].xml", cluster_type: null, dynamic: true },
]);

export async function getOverview() {
  const summary = await repo.overviewSummary();
  const sitemaps = await repo.sitemapCounts();
  const totalEligibleClusters = sitemaps.reduce((sum, r) => sum + (r.eligible || 0), 0);
  const detectedSitemapBuckets = sitemaps.length;
  const emptySitemapBuckets = SITEMAP_INDEX.filter(
    (s) => s.cluster_type && !sitemaps.find((r) => r.cluster_type === s.cluster_type && r.eligible > 0)
  ).length;

  return {
    publications: {
      total: summary?.total ?? 0,
      published: summary?.published ?? 0,
      planned: summary?.planned ?? 0,
      with_error: summary?.with_error ?? 0,
      indexable: summary?.indexable ?? 0,
      non_indexable: summary?.non_indexable ?? 0,
      last_update: summary?.last_publication_update ?? null,
    },
    clusters: {
      total: summary?.total_clusters ?? 0,
      sitemap_eligible: summary?.sitemap_eligible_clusters ?? 0,
      last_update: summary?.last_cluster_update ?? null,
    },
    coverage: {
      active_states: summary?.active_states ?? 0,
      cities_with_active_ads: summary?.cities_with_ads ?? 0,
    },
    sitemaps: {
      total_buckets: SITEMAP_INDEX.length,
      detected_buckets: detectedSitemapBuckets,
      empty_buckets: emptySitemapBuckets,
      total_eligible_clusters: totalEligibleClusters,
    },
  };
}

export async function listPublications(filters) {
  return repo.listPublications(filters);
}

export async function getPublicationById(id) {
  const publication = await repo.findPublicationById(id);
  if (!publication) throw new AppError("Publicação SEO não encontrada", 404);
  const [audits, history] = await Promise.all([
    repo.findPublicationAudits(id),
    repo.findAdminActionHistory(id),
  ]);
  return { ...publication, audits, history };
}

/**
 * PATCH /api/admin/seo/publications/:id
 * Permite editar: title, is_indexable, health_status, status. Reason
 * OBRIGATORIO para mudanca de is_indexable (decisao editorial) e status
 * (publicada vs draft etc). title/health_status sem reason ainda registra
 * admin_action mas nao bloqueia.
 */
export async function updatePublication(adminUserId, id, payload, reason) {
  const current = await repo.findPublicationById(id);
  if (!current) throw new AppError("Publicação SEO não encontrada", 404);

  const sanitized = {};

  if ("is_indexable" in payload) {
    if (typeof payload.is_indexable !== "boolean") {
      throw new AppError("is_indexable deve ser boolean", 400);
    }
    sanitized.is_indexable = payload.is_indexable;
  }
  if ("status" in payload) {
    if (!VALID_STATUS.includes(payload.status)) {
      throw new AppError(
        `status invalido. Valores aceitos: ${VALID_STATUS.join(", ")}`,
        400
      );
    }
    sanitized.status = payload.status;
  }
  if ("health_status" in payload) {
    if (!VALID_HEALTH.includes(payload.health_status)) {
      throw new AppError(
        `health_status invalido. Valores aceitos: ${VALID_HEALTH.join(", ")}`,
        400
      );
    }
    sanitized.health_status = payload.health_status;
  }
  if ("title" in payload) {
    const t = String(payload.title || "").trim();
    if (!t) throw new AppError("title nao pode ficar vazio", 400);
    if (t.length > 300) throw new AppError("title aceita no maximo 300 chars", 400);
    sanitized.title = t;
  }

  if (!Object.keys(sanitized).length) {
    throw new AppError("Nenhum campo valido para atualizar.", 400);
  }

  // diff (com normalizacao para evitar false-diff em strings)
  const diffOld = {};
  const diffNew = {};
  for (const k of Object.keys(sanitized)) {
    if (current[k] !== sanitized[k]) {
      diffOld[k] = current[k];
      diffNew[k] = sanitized[k];
    }
  }
  if (!Object.keys(diffNew).length) {
    return current; // no-op
  }

  const needsReason = "is_indexable" in diffNew || "status" in diffNew;
  const trimmedReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  if (needsReason && !trimmedReason) {
    throw new AppError(
      "Motivo (reason) e obrigatorio para alterar is_indexable ou status.",
      400
    );
  }

  const updated = await repo.updatePublication(id, sanitized);

  // Action especifica quando o admin SOMENTE flipa indexability
  let action = "update_seo_publication";
  if (Object.keys(diffNew).length === 1 && "is_indexable" in diffNew) {
    action = diffNew.is_indexable ? "mark_seo_indexable" : "mark_seo_noindex";
  }

  await recordAdminAction({
    adminUserId,
    action,
    targetType: "seo_publication",
    targetId: id,
    oldValue: diffOld,
    newValue: diffNew,
    reason: trimmedReason,
  });

  return updated;
}

export async function listSitemaps() {
  const counts = await repo.sitemapCounts();
  const regions = await repo.sitemapRegionCounts();
  const countsByType = Object.fromEntries(counts.map((r) => [r.cluster_type, r]));

  const entries = SITEMAP_INDEX.map((s) => {
    if (s.fixed_paths) {
      return {
        name: s.name,
        url: s.url,
        type: "static",
        eligible_urls: null,
        total_clusters: null,
        last_update: null,
        empty: false,
      };
    }
    if (s.dynamic) {
      const totalEligible = regions.reduce((sum, r) => sum + (r.total || 0), 0);
      return {
        name: s.name,
        url: s.url,
        type: "dynamic",
        eligible_urls: totalEligible,
        total_clusters: null,
        last_update: regions
          .map((r) => r.last_update)
          .filter(Boolean)
          .sort()
          .pop() || null,
        empty: totalEligible === 0,
        per_region: regions,
      };
    }
    const c = countsByType[s.cluster_type];
    return {
      name: s.name,
      url: s.url,
      cluster_type: s.cluster_type,
      type: "cluster",
      eligible_urls: c?.eligible ?? 0,
      total_clusters: c?.total ?? 0,
      last_update: c?.last_update ?? null,
      empty: !c || c.eligible === 0,
    };
  });

  const summary = {
    total: entries.length,
    empty: entries.filter((e) => e.empty).length,
    total_eligible_urls: entries.reduce((sum, e) => sum + (e.eligible_urls || 0), 0),
  };

  return { data: entries, summary };
}

export async function listIssues(opts) {
  return repo.listIssues(opts);
}
