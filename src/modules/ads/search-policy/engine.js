// src/modules/ads/search-policy/engine.js
//
// Orquestrador do Search Policy Engine v2.1 (§4, §5, §6, §4.9).
//
//   buildSearchContext  → LocationResolver → ProductResolver → IntentResolver → pedido de geo
//   runSearchPolicyEngine (v1) → ScopeResolver → CandidateScope → grid + count + facetas
//                                 → relaxações (se total < target) → resposta §6 → telemetria
//   runShadowComparison (shadow) → ScopeResolver + count + primeiro id → só telemetria
//
// Determinístico (R7): mesma URL + mesma política + mesmo banco = mesma
// resposta. Nenhuma chamada externa. Nenhuma lógica de ranking/escopo/faceta
// no frontend (R8): tudo sai daqui em JSON.

import { pool } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";
import { ADS_FILTER_LIMITS, isAllowedAdsSort } from "../filters/ads-filter.constants.js";
import { buildSortClause } from "../filters/ads-filter.sort.js";
import { commercialLayerExpr, opportunityExpr } from "../filters/ads-ranking.sql.js";
import { normalizePublicAdRows } from "../ads.public-images.js";
import { serializeAdsForListing } from "../ads.public-listing.js";
import { buildCandidateScope } from "./candidate-scope.js";
import { buildChips } from "./chips.js";
import { getBrandDictionary, getCommercialModelDictionary } from "./dictionaries.js";
import { computeFacets } from "./facets-policy.js";
import { isOriginAllowed } from "./flag.js";
import { resolveIntent } from "./intent-resolver.js";
import { resolveLocation } from "./location-resolver.js";
import { policyCacheBackend } from "./policy-cache.js";
import { loadSearchPolicy } from "./policy-config.js";
import { resolveProduct } from "./product-resolver.js";
import { computeRelaxations } from "./relaxations.js";
import { GEO_MODE, resolveGeoRequest, resolveScope } from "./scope-resolver.js";
import { buildSearchExecutedPayload, recordSearchExecuted } from "./telemetry.js";

export const SHADOW_TIMEOUT_MS = 300;

/** Campos que o v1 acrescenta ao contrato slim da listagem (§5.5, §6). */
export const V1_EXTRA_LISTING_FIELDS = Object.freeze([
  "explain",
  "distance_km",
  "commercial_model",
]);

function clampPage(v) {
  return Math.max(1, Number(v) || 1);
}
function clampLimit(v) {
  return Math.min(
    ADS_FILTER_LIMITS.LIMIT_MAX,
    Math.max(1, Number(v) || ADS_FILTER_LIMITS.DEFAULT_LIMIT)
  );
}

/**
 * Monta o SearchContext a partir dos parâmetros brutos da URL.
 * @param {object} rawQuery
 * @param {{ db?, policy? }} deps
 */
export async function buildSearchContext(rawQuery = {}, deps = {}) {
  const db = deps.db || pool;
  const policy = deps.policy || (await loadSearchPolicy());

  const location = await resolveLocation(rawQuery, policy, { db });
  const [brands, commercialModels] = await Promise.all([
    getBrandDictionary(db),
    getCommercialModelDictionary(db),
  ]);
  const product = resolveProduct(location.q, rawQuery, { brands, commercialModels });
  const filters = { ...product.filters };
  if (product.residual_q) filters.q = product.residual_q;

  const intent = resolveIntent(filters, product.residual_q, policy);
  const geoRequest = resolveGeoRequest(rawQuery, policy, Boolean(location.origin), {
    uf: location.uf,
  });

  const sortRaw = String(rawQuery.sort || "relevance")
    .trim()
    .toLowerCase();
  return {
    rawQuery,
    rawQ: typeof rawQuery.q === "string" ? rawQuery.q : null,
    page: clampPage(rawQuery.page),
    limit: clampLimit(rawQuery.limit),
    sort: isAllowedAdsSort(sortRaw) ? sortRaw : "relevance",
    filters,
    consumed: product.consumed,
    origin: location.origin,
    location_source: location.location_source,
    uf: location.uf,
    intent,
    geoRequest,
    policy,
  };
}

/** ORDER BY do v1 (§4.5). Só `relevance` muda; os demais seguem o legado. */
export function buildEngineSortClause(sort, { hasOrigin, hasText }) {
  if (sort !== "relevance") return buildSortClause(sort, { useTextRank: false });
  const parts = [`${commercialLayerExpr} DESC`];
  if (hasOrigin) parts.push("COALESCE(rm.distance_km, 0) ASC");
  if (hasText) parts.push("text_rank DESC");
  parts.push("a.created_at DESC", "a.id ASC");
  return parts.join(",\n      ");
}

/**
 * dataQuery + countQuery a partir do MESMO CandidateScope (§4.1).
 * countParams = só os parâmetros do WHERE (snapshot antes de rm/limit/offset).
 */
export function buildEngineQueries(ctx, scope) {
  const scopeCtx = { filters: ctx.filters, territory: scope.territory };
  const candidate = buildCandidateScope(scopeCtx);
  const whereParamsLength = candidate.params.length;
  const bag = candidate.bag;
  const hasOrigin =
    Boolean(ctx.origin) &&
    scope.geo_mode !== GEO_MODE.NATIONAL &&
    scope.geo_mode !== GEO_MODE.STATE;

  const rmJoin = hasOrigin
    ? `LEFT JOIN region_memberships rm ON rm.base_city_id = ${bag.p(Number(ctx.origin.id))} AND rm.member_city_id = a.city_id`
    : "";
  const textRank = candidate.qParam
    ? `ts_rank(a.search_vector, plainto_tsquery('portuguese', ${candidate.qParam}))`
    : "0";
  const orderBy = buildEngineSortClause(ctx.sort, {
    hasOrigin,
    hasText: Boolean(candidate.qParam),
  });
  const limitP = bag.p(ctx.limit);
  const offsetP = bag.p((ctx.page - 1) * ctx.limit);

  const dataQuery = `
    SELECT
      a.*,
      c.slug AS city_slug,
      c.name AS city_name,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.id           AS dealership_id,
      u.document_type  AS account_type,
      ${commercialLayerExpr} AS priority_tier,
      ${opportunityExpr} AS opportunity,
      ${textRank} AS text_rank,
      ${hasOrigin ? "COALESCE(rm.distance_km, 0)::float" : "NULL::float"} AS distance_km
    FROM ads a ${candidate.joins}
    ${rmJoin}
    ${candidate.whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limitP}
    OFFSET ${offsetP}`;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM ads a ${candidate.joins}
    ${candidate.whereClause}`;

  return {
    dataQuery,
    countQuery,
    params: bag.params,
    countParams: bag.params.slice(0, whereParamsLength),
    candidate,
    scopeCtx,
  };
}

function tierLabel(priorityTier) {
  const n = Number(priorityTier);
  if (n >= 4) return "Destaque";
  if (n >= 3) return "Pró";
  if (n >= 2) return "Start";
  return "Grátis";
}

/** Linha explicativa do card (§5.5). */
export function buildExplain(row) {
  const below = row.below_fipe === true;
  const diff = row.fipe_diff_percent == null ? null : Number(row.fipe_diff_percent);
  return {
    tier_label: tierLabel(row.priority_tier),
    city_name: row.city_name || row.city || null,
    distance_km: row.distance_km == null ? null : Number(Number(row.distance_km).toFixed(2)),
    fipe_diff_percent: below && Number.isFinite(diff) ? diff : null,
  };
}

function echoFilters(ctx) {
  return {
    page: ctx.page,
    limit: ctx.limit,
    sort: ctx.sort,
    q: ctx.rawQ || undefined,
    city_slug: ctx.origin?.slug,
    origem: ctx.origin?.slug,
    free_query_meta: {
      original_q: ctx.rawQ || null,
      parsed: Boolean(ctx.rawQ),
      safe: true,
      inferred: { ...ctx.filters, city_slug: ctx.origin?.slug || null },
    },
  };
}

function buildSearchPolicyBlock(ctx, scope, total, flagMode) {
  const withOrigin = scope.geo_mode !== GEO_MODE.NATIONAL && scope.geo_mode !== GEO_MODE.STATE;
  return {
    version: ctx.policy.version,
    flag_mode: flagMode,
    profile: ctx.intent.profile,
    specificity: ctx.intent.specificity,
    geo_mode: scope.geo_mode,
    origin_city: ctx.origin
      ? { slug: ctx.origin.slug, name: ctx.origin.name, state: ctx.origin.state }
      : null,
    location_source: ctx.location_source,
    requested_radius_km: scope.requested_radius_km,
    required_distance_km: scope.required_distance_km,
    effective_radius_km: withOrigin ? scope.effective_radius_km : null,
    cities: scope.cities,
    territory_city_count: scope.territory_city_count,
    rings: withOrigin ? scope.rings : [],
    local_result_count: scope.local_result_count,
    total_result_count: total,
    target: ctx.intent.target,
    expanded: scope.expanded,
    reason: scope.reason,
    uf: scope.geo_mode === GEO_MODE.STATE ? ctx.uf : undefined,
  };
}

/**
 * Executa o motor (v1) e devolve a resposta completa (§6).
 * @param {object} rawQuery
 * @param {{ flagMode?: string, path?: string, db?, cache?: boolean, telemetry?: boolean }} opts
 */
export async function runSearchPolicyEngine(rawQuery, opts = {}) {
  const db = opts.db || pool;
  const flagMode = opts.flagMode || "v1";
  const started = Date.now();

  const ctx = await buildSearchContext(rawQuery, { db, policy: opts.policy });
  const scope = await resolveScope(ctx, ctx.policy, { db, cache: opts.cache });
  const queries = buildEngineQueries(ctx, scope);

  const [dataResult, countResult, facetsResult] = await Promise.all([
    db.query(queries.dataQuery, queries.params),
    db.query(queries.countQuery, queries.countParams),
    computeFacets(queries.scopeCtx, ctx.policy, { db }),
  ]);
  const total = Number(countResult.rows[0]?.total || 0);

  const relax = await computeRelaxations(ctx, scope, total, ctx.policy, { db, cache: opts.cache });

  const normalized = await normalizePublicAdRows(dataResult.rows);
  const withExplain = normalized.map((row, i) => ({
    ...row,
    distance_km: dataResult.rows[i]?.distance_km ?? null,
    explain: buildExplain({ ...dataResult.rows[i], ...row }),
  }));
  const items = serializeAdsForListing(withExplain, {
    extraAllowedFields: V1_EXTRA_LISTING_FIELDS,
  });

  const response = {
    ok: true,
    filters: echoFilters(ctx),
    data: items,
    pagination: {
      page: ctx.page,
      limit: ctx.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / ctx.limit)),
    },
    search_policy: buildSearchPolicyBlock(ctx, scope, total, flagMode),
    chips: buildChips(ctx, scope),
    facets: facetsResult.facets,
    relaxations: relax.relaxations,
  };

  if (opts.telemetry !== false) {
    const payload = buildSearchExecutedPayload({
      ctx,
      scope,
      total,
      relaxations: relax.relaxations,
      flagMode,
      policy: ctx.policy,
      cacheBackend: policyCacheBackend(),
    });
    payload.engine_ms = Date.now() - started;
    payload.queries = 2 + facetsResult.queries + relax.queries + 1;
    recordSearchExecuted({ path: opts.path, ctx, payload }, { db }).catch(() => {});
  }

  return response;
}

/**
 * v1 só quando a origem resolvida está na allowlist; senão devolve null e o
 * controller segue o caminho legado (comportamento `off` para a requisição).
 */
/**
 * §4.9 — o motor só assume requisições que modela por completo. Chaves do
 * contrato legado que mudam o resultado e que o v1 NÃO traduz ficam no caminho
 * legado (em v1) e viram evento `skipped` (em shadow):
 *   model          ILIKE na descrição FIPE (ads.model); o v1 filtra por
 *                  commercial_model — F3 mapeia o filtro de modelo do frontend.
 *   highlight_only / highlight / featured   WHERE highlight_until > NOW()
 *                  (widget "Destaques" da home).
 *   city / seller_type   aliases legados normalizados pelo parser antigo.
 *   city_slugs com 2+ cidades   lista fechada da Página Regional — semântica
 *                  distinta do raio automático a partir de city_slugs[0].
 */
export const ENGINE_LEGACY_ONLY_KEYS = Object.freeze([
  "model",
  "highlight_only",
  "highlight",
  "featured",
  "city",
  "seller_type",
]);

function hasValue(v) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== "";
}

export function findUnsupportedParams(rawQuery = {}) {
  const found = ENGINE_LEGACY_ONLY_KEYS.filter((key) => hasValue(rawQuery[key]));
  const slugs = rawQuery.city_slugs;
  const slugCount = Array.isArray(slugs)
    ? slugs.filter(hasValue).length
    : typeof slugs === "string"
      ? slugs.split(",").filter((x) => x.trim()).length
      : 0;
  if (slugCount > 1) found.push("city_slugs");
  return found;
}

export async function runSearchPolicyEngineIfAllowed(rawQuery, opts = {}) {
  if (findUnsupportedParams(rawQuery).length > 0) return null;
  const ctx = await buildSearchContext(rawQuery, { db: opts.db, policy: opts.policy });
  if (!isOriginAllowed(ctx.origin?.slug)) return null;
  return runSearchPolicyEngine(rawQuery, { ...opts, policy: ctx.policy });
}

/**
 * Shadow (§4.9): scope + count + primeiro id, com timeout de 300 ms, e
 * telemetria com old/new. Nunca lança; nunca altera a resposta.
 */
export async function runShadowComparison(rawQuery, legacyResult, opts = {}) {
  const db = opts.db || pool;
  const started = Date.now();
  const unsupported = findUnsupportedParams(rawQuery);
  if (unsupported.length > 0) {
    const shadow = {
      old_count: Number(legacyResult?.pagination?.total ?? 0),
      old_first_ad_id: legacyResult?.data?.[0]?.id ?? null,
      new_count: null,
      new_first_ad_id: null,
      elapsed_ms: Date.now() - started,
    };
    const payload = buildSearchExecutedPayload({
      ctx: { rawQ: rawQuery?.q || null, filters: {}, intent: null, origin: null },
      scope: null,
      total: null,
      relaxations: [],
      flagMode: "shadow",
      shadow,
      policy: opts.policy,
      cacheBackend: policyCacheBackend(),
    });
    payload.skipped = "unsupported_params";
    payload.unsupported_params = unsupported;
    await recordSearchExecuted({ path: opts.path, ctx: null, payload }, { db });
    return { ...shadow, timedOut: false, skipped: true, unsupported_params: unsupported };
  }
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), opts.timeoutMs ?? SHADOW_TIMEOUT_MS);
  });
  const work = (async () => {
    const ctx = await buildSearchContext(rawQuery, { db, policy: opts.policy });
    const scope = await resolveScope(ctx, ctx.policy, { db, cache: opts.cache });
    const queries = buildEngineQueries({ ...ctx, page: 1, limit: 1 }, scope);
    const [countResult, firstResult] = await Promise.all([
      db.query(queries.countQuery, queries.countParams),
      db.query(queries.dataQuery, queries.params),
    ]);
    return {
      ctx,
      scope,
      new_count: Number(countResult.rows[0]?.total || 0),
      new_first_ad_id: firstResult.rows[0]?.id ?? null,
    };
  })();

  try {
    const outcome = await Promise.race([work, timeout]);
    clearTimeout(timer);
    const shadow = {
      old_count: Number(legacyResult?.pagination?.total ?? 0),
      old_first_ad_id: legacyResult?.data?.[0]?.id ?? null,
      new_count: outcome.timedOut ? null : outcome.new_count,
      new_first_ad_id: outcome.timedOut ? null : outcome.new_first_ad_id,
      elapsed_ms: Date.now() - started,
    };
    const ctx = outcome.timedOut ? null : outcome.ctx;
    const payload = buildSearchExecutedPayload({
      ctx: ctx || { rawQ: rawQuery?.q || null, filters: {}, intent: null, origin: null },
      scope: outcome.timedOut ? null : outcome.scope,
      total: outcome.timedOut ? null : outcome.new_count,
      relaxations: [],
      flagMode: "shadow",
      shadow,
      policy: ctx?.policy,
      cacheBackend: policyCacheBackend(),
    });
    if (outcome.timedOut) payload.shadow_timeout = true;
    await recordSearchExecuted({ path: opts.path, ctx, payload }, { db });
    return { ...shadow, timedOut: Boolean(outcome.timedOut) };
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ err: err?.message || String(err) }, "[search-policy] shadow falhou");
    return null;
  }
}
