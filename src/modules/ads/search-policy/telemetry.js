// src/modules/ads/search-policy/telemetry.js
//
// Evento `search.executed` (§4.8) em analytics_events. Best-effort: nunca
// lança para o caller. Se o schema não aceita o evento — coluna `payload`
// ausente (42703) ou CHECK de event_type sem 'search.executed' (23514), ambos
// resolvidos pela migration 066 — registra UM warn e desiste até o próximo
// restart, para não gerar um warn por busca no modo shadow.
//
// Não passa pelo coletor público (analytics.controller) porque este evento é
// interno ao servidor e o coletor valida um allowlist de tipos do cliente.

import { pool } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";

export const SEARCH_EXECUTED_EVENT = "search.executed";

let telemetryDisabled = false;
const SCHEMA_ERROR_CODES = new Set(["42703", "23514"]);

export function buildSearchExecutedPayload({
  ctx,
  scope,
  total,
  relaxations,
  flagMode,
  shadow,
  policy,
  cacheBackend,
}) {
  return {
    q: ctx.rawQ || null,
    residual_q: ctx.filters?.q || null,
    profile: ctx.intent?.profile || null,
    specificity: ctx.intent?.specificity ?? null,
    origin_city: ctx.origin?.slug || null,
    location_source: ctx.location_source || null,
    geo_mode: scope?.geo_mode || null,
    requested_radius: scope?.requested_radius_km ?? null,
    required_distance: scope?.required_distance_km ?? null,
    effective_radius: scope?.effective_radius_km ?? null,
    local_count: scope?.local_result_count ?? null,
    total_count: total ?? null,
    expanded: scope?.expanded ?? null,
    reason: scope?.reason || null,
    relaxations_shown: Array.isArray(relaxations) ? relaxations.map((r) => r.dimension) : [],
    policy_version: policy?.version || null,
    flag_mode: flagMode,
    cache_backend: cacheBackend || null,
    ...(shadow
      ? {
          old_count: shadow.old_count ?? null,
          old_first_ad_id: shadow.old_first_ad_id ?? null,
          new_count: shadow.new_count ?? null,
          new_first_ad_id: shadow.new_first_ad_id ?? null,
          shadow_ms: shadow.elapsed_ms ?? null,
        }
      : {}),
  };
}

export async function recordSearchExecuted({ path, ctx, payload }, deps = {}) {
  if (telemetryDisabled) return false;
  const db = deps.db || pool;
  try {
    await db.query(
      `INSERT INTO analytics_events (event_type, path, entity_type, city_slug, city_name, state, payload)
       VALUES ($1, $2, 'search', $3, $4, $5, $6::jsonb)`,
      [
        SEARCH_EXECUTED_EVENT,
        String(path || "").slice(0, 512),
        ctx?.origin?.slug || null,
        ctx?.origin?.name || null,
        ctx?.origin?.state || ctx?.uf || null,
        JSON.stringify(payload),
      ]
    );
    return true;
  } catch (err) {
    if (
      SCHEMA_ERROR_CODES.has(String(err?.code)) ||
      /column "payload"/i.test(String(err?.message))
    ) {
      telemetryDisabled = true;
      logger.warn(
        { code: err?.code, err: err?.message },
        "[search-policy] analytics_events não aceita search.executed (migration 066 aplicada?) — telemetria desligada"
      );
    } else {
      logger.warn({ err: err?.message }, "[search-policy] falha ao gravar search.executed");
    }
    return false;
  }
}

export function __resetTelemetryForTests() {
  telemetryDisabled = false;
}
